import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import ligatecLogo from "../assets/ligatec-logo.png";
import heroImage from "../assets/league-hero.webp";
import { DEFAULT_IDENTITY } from "./data/seedData.js";
import { getCurrentLeague, normalizeStore } from "./lib/domain.js";
import { loadStore, saveStore } from "./lib/storage.js";
import { clearAuth, loadAuth, saveAuth } from "./lib/authStorage.js";
import { fetchSessionFromApi, fetchStoreFromApi, loginWithApi, persistStoreToApi } from "./lib/api.js";
import "./styles.css";

const LazyAdminRoute = React.lazy(() => import("./components/AdminRoute.jsx").then((module) => ({ default: module.AdminRoute })));
const LazyAuthPanel = React.lazy(() => import("./components/AuthPanel.jsx").then((module) => ({ default: module.AuthPanel })));
const LazyLegalView = React.lazy(() => import("./components/LegalView.jsx").then((module) => ({ default: module.LegalView })));
const LazyPublicView = React.lazy(() => import("./components/PublicView.jsx").then((module) => ({ default: module.PublicView })));
const LazyTeamPortal = React.lazy(() => import("./components/TeamPortal.jsx").then((module) => ({ default: module.TeamPortal })));
const LazyDelegateActivationView = React.lazy(() => import("./components/DelegateActivationView.jsx").then((module) => ({ default: module.DelegateActivationView })));
const LazyRefereePortal = React.lazy(() => import("./components/RefereePortal.jsx").then((module) => ({ default: module.RefereePortal })));
const LazyRefereeActivationView = React.lazy(() => import("./components/RefereeActivationView.jsx").then((module) => ({ default: module.RefereeActivationView })));

function registerPwaServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {
      // La app sigue funcionando como web normal si el navegador bloquea el registro.
    });
  });
}

const initialIsPrivateRoute = window.location.pathname.startsWith("/admin") || window.location.pathname.startsWith("/equipo") || window.location.pathname.startsWith("/arbitro");
const cachedStore = initialIsPrivateRoute ? loadStore() : null;
const emptyStore = normalizeStore({ currentLeagueId: "", leagues: [] });
const initialStore = cachedStore || emptyStore;
const initialAuth = loadAuth();

function getPublicLeagueIdFromPath(path) {
  const [, section, leagueId] = path.split("/");
  return section === "liga" ? decodeURIComponent(leagueId || "") : "";
}

function getLegalLeagueIdFromPath(path) {
  const [, section, leagueId] = path.split("/");
  return section === "legal" ? decodeURIComponent(leagueId || "") : "";
}

function getDelegateActivationTokenFromPath(path) {
  const [, section, token] = path.split("/");
  return section === "activar-delegado" ? decodeURIComponent(token || "") : "";
}

function getRefereeActivationTokenFromPath(path) {
  const [, section, token] = path.split("/");
  return section === "activar-arbitro" ? decodeURIComponent(token || "") : "";
}

function getPublicLeaguePath(leagueId) {
  return `/liga/${encodeURIComponent(leagueId)}`;
}

function getLegalLeaguePath(leagueId) {
  return `/legal/${encodeURIComponent(leagueId)}`;
}

const LAST_PUBLIC_LEAGUE_KEY = "ligatec:lastPublicLeagueId";

function loadLastPublicLeagueId() {
  try {
    return localStorage.getItem(LAST_PUBLIC_LEAGUE_KEY) || "";
  } catch {
    return "";
  }
}

function saveLastPublicLeagueId(leagueId) {
  try {
    if (leagueId) localStorage.setItem(LAST_PUBLIC_LEAGUE_KEY, leagueId);
  } catch {
    // Navegacion publica: si localStorage no esta disponible, seguimos sin recordar.
  }
}

function RouteFallback({ label = "Cargando" }) {
  return (
    <main className="startup-screen">
      <div className="startup-card">
        <span className="brand-mark brand-mark-logo"><img alt="" src={ligatecLogo} /></span>
        <strong>{label}</strong>
        <small>Preparando la experiencia de LIGATEC.</small>
      </div>
    </main>
  );
}

function InlineFallback({ label = "Cargando" }) {
  return <div className="inline-loading">{label}</div>;
}

function App() {
  const [store, setStore] = useState(initialStore);
  const [routePath, setRoutePath] = useState(window.location.pathname);
  const [adminPanel, setAdminPanel] = useState("league");
  const [apiStatus, setApiStatus] = useState("checking");
  const [initialApiLoaded, setInitialApiLoaded] = useState(false);
  const [auth, setAuth] = useState(initialAuth);
  const [userListRefreshKey, setUserListRefreshKey] = useState(0);
  const pendingPersistRef = useRef(null);
  const persistRunningRef = useRef(false);
  const isAdminRoute = routePath.startsWith("/admin");
  const isTeamRoute = routePath.startsWith("/equipo");
  const isRefereeRoute = routePath.startsWith("/arbitro");
  const isPrivateRoute = isAdminRoute || isTeamRoute || isRefereeRoute;
  const publicLeagueId = !isPrivateRoute ? getPublicLeagueIdFromPath(routePath) : "";
  const legalLeagueId = !isPrivateRoute ? getLegalLeagueIdFromPath(routePath) : "";
  const delegateActivationToken = !isPrivateRoute ? getDelegateActivationTokenFromPath(routePath) : "";
  const refereeActivationToken = !isPrivateRoute ? getRefereeActivationTokenFromPath(routePath) : "";
  const routeLeagueId = publicLeagueId || legalLeagueId;
  const league = useMemo(() => {
    if (!store.leagues.length) return null;
    if (routeLeagueId) return store.leagues.find((item) => item.id === routeLeagueId) || getCurrentLeague(store);
    return getCurrentLeague(store);
  }, [routeLeagueId, store]);
  const currentUser = auth.user;
  const canUseSuperAdmin = currentUser?.role === "super_admin";
  const canUseLeagueAdmin = currentUser?.role === "league_admin" && currentUser.leagueId === league?.id && league?.status === "active";
  const canUseAdmin = canUseSuperAdmin || canUseLeagueAdmin;
  const shouldRedirectAdminToTeamPortal = isAdminRoute && currentUser?.role === "team_delegate";
  const shouldRedirectAdminToRefereePortal = isAdminRoute && currentUser?.role === "referee";
  const shouldRedirectTeamPortalToAdmin = isTeamRoute && currentUser && currentUser.role !== "team_delegate";
  const shouldRedirectRefereePortalToAdmin = isRefereeRoute && currentUser && currentUser.role !== "referee";
  const publicLeaguePath = league?.id ? getPublicLeaguePath(league.id) : "/";
  const legalLeaguePath = league?.id ? getLegalLeaguePath(league.id) : "/legal";
  const isLegalRoute = routePath === "/legal" || routePath.startsWith("/legal/");
  const isDelegateActivationRoute = routePath.startsWith("/activar-delegado/");
  const isRefereeActivationRoute = routePath.startsWith("/activar-arbitro/");

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

    fetchStoreFromApi(initialAuth.token)
      .then((apiStore) => {
        if (cancelled) return;
        const rememberedLeagueId = loadLastPublicLeagueId();
        const preferredLeagueId = routeLeagueId ||
          (apiStore.leagues?.some((item) => item.id === rememberedLeagueId) ? rememberedLeagueId : apiStore.currentLeagueId);
        const normalized = normalizeStore({ ...apiStore, currentLeagueId: preferredLeagueId });
        setStore(normalized);
        saveStore(normalized);
        setApiStatus("connected");
        setInitialApiLoaded(true);
      })
      .catch(() => {
        if (!cancelled) {
          setApiStatus("offline");
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

  useEffect(() => {
    if (shouldRedirectAdminToTeamPortal) navigateTo("/equipo");
    if (shouldRedirectAdminToRefereePortal) navigateTo("/arbitro");
    if (shouldRedirectTeamPortalToAdmin) navigateTo("/admin");
    if (shouldRedirectRefereePortalToAdmin) navigateTo("/admin");
  }, [shouldRedirectAdminToTeamPortal, shouldRedirectAdminToRefereePortal, shouldRedirectTeamPortalToAdmin, shouldRedirectRefereePortalToAdmin]);

  async function flushPersistQueue() {
    if (persistRunningRef.current || !auth.token) return;
    persistRunningRef.current = true;

    try {
      while (pendingPersistRef.current) {
        const nextStore = pendingPersistRef.current;
        pendingPersistRef.current = null;
        try {
          await persistStoreToApi(nextStore, auth.token);
          setApiStatus("connected");
        } catch {
          setApiStatus("local");
        }
      }
    } finally {
      persistRunningRef.current = false;
      if (pendingPersistRef.current) flushPersistQueue();
    }
  }

  function queuePersist(nextStore) {
    if (!auth.token) {
      setApiStatus("local");
      return;
    }
    pendingPersistRef.current = nextStore;
    flushPersistQueue();
  }

  function commit(nextStore) {
    const normalized = normalizeStore(nextStore);
    setStore(normalized);
    saveStore(normalized);
    queuePersist(normalized);
  }

  function applyApiStore(apiStore) {
    const normalized = normalizeStore(apiStore);
    setStore(normalized);
    saveStore(normalized);
  }

  function selectLeague(leagueId) {
    if (!leagueId) return;
    saveLastPublicLeagueId(leagueId);
    const normalized = normalizeStore({ ...store, currentLeagueId: leagueId });
    setStore(normalized);
    saveStore(normalized);
    if (!isPrivateRoute) navigateTo(getPublicLeaguePath(leagueId));
  }

  useEffect(() => {
    if (!isPrivateRoute && league?.id) saveLastPublicLeagueId(league.id);
  }, [isPrivateRoute, league?.id]);

  async function login(email, password) {
    const nextAuth = await loginWithApi(email, password);
    const apiStore = await fetchStoreFromApi(nextAuth.token);
    const preferredLeagueId = nextAuth.user.role === "league_admin" && nextAuth.user.leagueId
      ? nextAuth.user.leagueId
      : apiStore.currentLeagueId;
    const normalizedStore = normalizeStore({ ...apiStore, currentLeagueId: preferredLeagueId });
    setAuth(nextAuth);
    saveAuth(nextAuth);
    setStore(normalizedStore);
    saveStore(normalizedStore);
    setApiStatus("connected");
    if (nextAuth.user.role === "team_delegate") {
      navigateTo("/equipo");
    } else if (nextAuth.user.role === "referee") {
      navigateTo("/arbitro");
    } else if (!isAdminRoute) {
      navigateTo("/admin");
    }
  }

  async function completeDelegateActivation(nextAuth) {
    const apiStore = await fetchStoreFromApi(nextAuth.token);
    const normalizedStore = normalizeStore(apiStore);
    setAuth(nextAuth);
    saveAuth(nextAuth);
    setStore(normalizedStore);
    saveStore(normalizedStore);
    setApiStatus("connected");
    navigateTo("/equipo");
  }

  async function completeRefereeActivation(nextAuth) {
    const apiStore = await fetchStoreFromApi(nextAuth.token);
    const normalizedStore = normalizeStore(apiStore);
    setAuth(nextAuth);
    saveAuth(nextAuth);
    setStore(normalizedStore);
    saveStore(normalizedStore);
    setApiStatus("connected");
    navigateTo("/arbitro");
  }

  function logout() {
    setAuth({ token: "", user: null });
    clearAuth();
    navigateTo(publicLeaguePath);
    setAdminPanel("league");
  }

  const identity = league?.identity || DEFAULT_IDENTITY;
  const themeStyle = {
    "--field": identity.primaryColor,
    "--field-dark": identity.primaryColor,
    "--lime": identity.accentColor,
    "--blue": identity.secondaryColor
  };

  if (!initialApiLoaded && !isPrivateRoute && !isDelegateActivationRoute && !isRefereeActivationRoute) {
    return (
      <main className="startup-screen">
        <div className="startup-card">
          <span className="brand-mark brand-mark-logo"><img alt="" src={ligatecLogo} /></span>
          <strong>Cargando liga</strong>
          <small>Preparando calendario, tabla y estadisticas.</small>
        </div>
      </main>
    );
  }

  if (!league && !isPrivateRoute && !isLegalRoute && !isDelegateActivationRoute && !isRefereeActivationRoute) {
    return (
      <main className="startup-screen">
        <div className="startup-card">
          <span className="brand-mark brand-mark-logo"><img alt="" src={ligatecLogo} /></span>
          <strong>No se pudieron cargar datos reales</strong>
          <small>Revisa tu conexion e intenta actualizar la pagina.</small>
        </div>
      </main>
    );
  }

  if (!league && isAdminRoute && canUseAdmin) {
    return <RouteFallback label="Cargando datos reales" />;
  }

  if (shouldRedirectAdminToTeamPortal || shouldRedirectAdminToRefereePortal || shouldRedirectTeamPortalToAdmin || shouldRedirectRefereePortalToAdmin) {
    return <RouteFallback label="Redirigiendo acceso" />;
  }

  return (
    <div className={isPrivateRoute ? "app-shell admin-route-shell" : "app-shell public-route-shell"} style={themeStyle}>
      <header className={`topbar ${isPrivateRoute ? "admin-topbar" : "public-topbar"}`}>
        <a className="brand" href={isAdminRoute ? "/admin" : publicLeaguePath} aria-label="Ir al inicio" onClick={(event) => {
          event.preventDefault();
          navigateTo(isAdminRoute ? "/admin" : isTeamRoute ? "/equipo" : isRefereeRoute ? "/arbitro" : publicLeaguePath);
        }}>
          <span className="brand-mark brand-mark-logo"><img alt="" src={ligatecLogo} /></span>
          <span className="brand-copy">
            <strong className="brand-wordmark">LIGA<span>TEC</span></strong>
            <small>PLATAFORMA DEPORTIVA</small>
          </span>
        </a>
        <div className="topbar-actions">
          {isAdminRoute ? (
            <label className="league-switcher">
              <span>Liga</span>
              <select value={league?.id || ""} onChange={(event) => selectLeague(event.target.value)} disabled={!store.leagues.length}>
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
              <strong>{isLegalRoute ? "Aviso legal" : league?.name || "Cargando"}</strong>
            </div>
          )}
          {!isPrivateRoute && (
            <a className="admin-public-link" href={isLegalRoute ? publicLeaguePath : legalLeaguePath} onClick={(event) => {
              event.preventDefault();
              navigateTo(isLegalRoute ? publicLeaguePath : legalLeaguePath);
            }}>
              {isLegalRoute ? "Vista liga" : "Legal"}
            </a>
          )}
          {isPrivateRoute && (
            <>
              {league?.id && <a className="admin-public-link" href={publicLeaguePath} onClick={(event) => {
                event.preventDefault();
                navigateTo(publicLeaguePath);
              }}>
                Vista publica
              </a>}
              {isAdminRoute && <span className={`api-pill ${apiStatus}`}>
                {apiStatus === "connected" ? "API local" : apiStatus === "local" ? "Modo local" : "Conectando"}
              </span>}
              {currentUser && (
                <Suspense fallback={<span className="auth-loading">Sesion activa</span>}>
                  <LazyAuthPanel currentUser={currentUser} onLogin={login} onLogout={logout} />
                </Suspense>
              )}
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
            <Suspense fallback={<InlineFallback label="Cargando acceso" />}>
              <LazyAuthPanel currentUser={currentUser} onLogin={login} onLogout={logout} />
            </Suspense>
            <a href="/" onClick={(event) => {
              event.preventDefault();
              navigateTo("/");
            }}>
              Volver a la pagina publica
            </a>
          </section>
        </main>
      ) : isTeamRoute && currentUser?.role !== "team_delegate" ? (
        <main className="page admin-access-page">
          <section className="admin-access-card">
            <span className="eyebrow">Acceso privado</span>
            <h1>Portal de equipo</h1>
            <p>Ingresa con el usuario delegado asignado a tu equipo para registrar plantilla.</p>
            <Suspense fallback={<InlineFallback label="Cargando acceso" />}>
              <LazyAuthPanel currentUser={currentUser} onLogin={login} onLogout={logout} />
            </Suspense>
            <a href="/" onClick={(event) => {
              event.preventDefault();
              navigateTo("/");
            }}>
              Volver a la pagina publica
            </a>
          </section>
        </main>
      ) : isRefereeRoute && currentUser?.role !== "referee" ? (
        <main className="page admin-access-page">
          <section className="admin-access-card">
            <span className="eyebrow">Acceso privado</span>
            <h1>Panel de arbitro</h1>
            <p>Ingresa con tu cuenta de arbitro para consultar partidos asignados.</p>
            <Suspense fallback={<InlineFallback label="Cargando acceso" />}>
              <LazyAuthPanel currentUser={currentUser} onLogin={login} onLogout={logout} />
            </Suspense>
            <a href="/" onClick={(event) => {
              event.preventDefault();
              navigateTo("/");
            }}>
              Volver a la pagina publica
            </a>
          </section>
        </main>
      ) : isDelegateActivationRoute ? (
        <Suspense fallback={<RouteFallback label="Cargando activacion" />}>
          <LazyDelegateActivationView token={delegateActivationToken} onActivated={completeDelegateActivation} onNavigate={navigateTo} />
        </Suspense>
      ) : isRefereeActivationRoute ? (
        <Suspense fallback={<RouteFallback label="Cargando activacion" />}>
          <LazyRefereeActivationView token={refereeActivationToken} onActivated={completeRefereeActivation} onNavigate={navigateTo} />
        </Suspense>
      ) : isLegalRoute ? (
        <Suspense fallback={<RouteFallback label="Cargando aviso legal" />}>
          <LazyLegalView league={league} onNavigate={navigateTo} publicLeaguePath={publicLeaguePath} />
        </Suspense>
      ) : league?.status === "suspended" && !isPrivateRoute ? (
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
        <Suspense fallback={<RouteFallback label="Cargando administracion" />}>
          <LazyAdminRoute
            adminPanel={adminPanel}
            applyApiStore={applyApiStore}
            authToken={auth.token}
            canUseSuperAdmin={canUseSuperAdmin}
            commit={commit}
            currentUser={currentUser}
            heroImage={heroImage}
            league={league}
            setAdminPanel={setAdminPanel}
            setApiStatus={setApiStatus}
            setUserListRefreshKey={setUserListRefreshKey}
            store={store}
            userListRefreshKey={userListRefreshKey}
          />
        </Suspense>
      ) : isTeamRoute ? (
        <Suspense fallback={<RouteFallback label="Cargando portal de equipo" />}>
          <LazyTeamPortal authToken={auth.token} currentUser={currentUser} />
        </Suspense>
      ) : isRefereeRoute ? (
        <Suspense fallback={<RouteFallback label="Cargando panel de arbitro" />}>
          <LazyRefereePortal authToken={auth.token} currentUser={currentUser} />
        </Suspense>
      ) : (
        <Suspense fallback={<RouteFallback label="Cargando liga" />}>
          <LazyPublicView heroImage={heroImage} legalPath={legalLeaguePath} league={league} onNavigate={navigateTo} />
        </Suspense>
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

registerPwaServiceWorker();

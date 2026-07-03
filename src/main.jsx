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
const LazyAdminActivationView = React.lazy(() => import("./components/AdminActivationView.jsx").then((module) => ({ default: module.AdminActivationView })));

function registerPwaServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {
      // La app sigue funcionando como web normal si el navegador bloquea el registro.
    });
  });
}

const ACCESS_SELECTION_KEY = "ligatec:selected-access";

function isAdminPath(path) {
  return path.startsWith("/admin") || path.startsWith("/panel/admin");
}

function isTeamPath(path) {
  return path.startsWith("/equipo") || path.startsWith("/panel/delegado");
}

function isRefereePath(path) {
  return path.startsWith("/arbitro") || path.startsWith("/panel/arbitro");
}

function isAccessPath(path) {
  return path === "/acceso";
}

function isAccessSelectionPath(path) {
  return path === "/seleccionar-acceso";
}

function getRoleLabel(role) {
  if (role === "super_admin") return "Super administrador";
  if (role === "league_admin") return "Administrador de liga";
  if (role === "admin_limited") return "Admin con permisos";
  if (role === "team_delegate") return "Delegado de equipo";
  if (role === "referee") return "Arbitro";
  return "Usuario LIGATEC";
}

function getPanelPathForRole(role) {
  if (role === "team_delegate") return "/panel/delegado";
  if (role === "referee") return "/panel/arbitro";
  if (["super_admin", "league_admin", "admin_limited"].includes(role)) return "/panel/admin";
  return "/seleccionar-acceso";
}

function findLeague(store, leagueId) {
  if (!leagueId) return null;
  return store.leagues.find((item) => item.id === leagueId) || null;
}

function buildAccessOptions(user, store) {
  if (!user || ["disabled", "suspended", "deleted"].includes(user.status)) return [];
  const rawAccesses = Array.isArray(user.accesses)
    ? user.accesses.filter((access) => access.status === "active")
    : [];
  if (!rawAccesses.length && user.role === "super_admin" && store.leagues.length > 1) {
    return store.leagues.map((league) => ({
      id: `super_admin-${league.id}`,
      role: "super_admin",
      roleLabel: getRoleLabel("super_admin"),
      leagueId: league.id,
      leagueName: league.name,
      teamId: "",
      teamName: "",
      path: "/panel/admin"
    }));
  }
  const primaryAccess = {
    role: user.role,
    leagueId: user.leagueId || store.currentLeagueId || "",
    teamId: user.teamId || "",
    teamName: user.teamName || ""
  };
  const sourceAccesses = rawAccesses.length
    ? rawAccesses
    : [primaryAccess];
  const hasPrimaryAccess = sourceAccesses.some((access) => (
    access.role === primaryAccess.role &&
    (access.leagueId || "") === (primaryAccess.leagueId || "") &&
    (access.teamId || "") === (primaryAccess.teamId || "")
  ));
  const accessList = rawAccesses.length && !hasPrimaryAccess
    ? [...sourceAccesses, primaryAccess]
    : sourceAccesses;

  return accessList
    .map((access, index) => {
      const role = access.role || user.role;
      const league = findLeague(store, access.leagueId || user.leagueId || "");
      const leagueName = league?.name || (role === "super_admin" ? "Todas las ligas" : access.leagueName || "Liga asignada");
      const teamName = access.teamName || user.teamName || "";
      return {
        id: access.id || `${role}-${access.leagueId || user.leagueId || "global"}-${access.teamId || index}`,
        role,
        roleLabel: getRoleLabel(role),
        leagueId: access.leagueId || user.leagueId || "",
        leagueName,
        teamId: access.teamId || user.teamId || "",
        teamName,
        permissions: Array.isArray(access.permissions) ? access.permissions : [],
        path: getPanelPathForRole(role)
      };
    })
    .filter((option) => option.path !== "/seleccionar-acceso" || accessList.length);
}

function loadSelectedAccess() {
  try {
    const raw = localStorage.getItem(ACCESS_SELECTION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSelectedAccess(access) {
  try {
    localStorage.setItem(ACCESS_SELECTION_KEY, JSON.stringify(access));
  } catch {
    // La seleccion solo mejora navegacion; si no se puede guardar, la sesion sigue viva.
  }
}

function clearSelectedAccess() {
  try {
    localStorage.removeItem(ACCESS_SELECTION_KEY);
  } catch {
    // Sin localStorage disponible no hay nada que limpiar.
  }
}

const initialIsPrivateRoute = isAdminPath(window.location.pathname) ||
  isTeamPath(window.location.pathname) ||
  isRefereePath(window.location.pathname) ||
  isAccessPath(window.location.pathname) ||
  isAccessSelectionPath(window.location.pathname);
const cachedStore = loadStore();
const emptyStore = normalizeStore({ currentLeagueId: "", leagues: [] });
const initialStore = cachedStore || emptyStore;
const initialAuth = loadAuth();
const initialSelectedAccess = loadSelectedAccess();

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

function getAdminActivationTokenFromPath(path) {
  const [, section, token] = path.split("/");
  return section === "activar-admin" ? decodeURIComponent(token || "") : "";
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

function AccessPage({ currentUser, onLogin, onLogout, onNavigate, publicLeaguePath, store, onSelectAccess }) {
  const accessOptions = buildAccessOptions(currentUser, store);

  return (
    <main className="page access-page">
      <section className="access-card">
        <div className="access-card-head">
          <span className="brand-mark brand-mark-logo access-logo"><img alt="" src={ligatecLogo} /></span>
          <div>
            <span className="eyebrow">Acceso privado</span>
            <h1>Acceso LIGATEC</h1>
            <p>Un solo inicio de sesion para administradores, arbitros y delegados.</p>
          </div>
        </div>

        <div className="access-lock-banner" aria-hidden="true">
          <span className="access-lock-icon" />
          <div>
            <strong>Plataforma deportiva</strong>
            <small>Tu rol se detecta automaticamente despues de iniciar sesion.</small>
          </div>
        </div>

        <Suspense fallback={<InlineFallback label="Cargando acceso" />}>
          <LazyAuthPanel currentUser={currentUser} onLogin={onLogin} onLogout={onLogout} />
        </Suspense>

        {currentUser && accessOptions.length > 0 && (
          <div className="access-current-session">
            <span>Sesion activa</span>
            <button className="primary" type="button" onClick={() => {
              if (accessOptions.length === 1) onSelectAccess(accessOptions[0]);
              else onNavigate("/seleccionar-acceso");
            }}>
              Continuar
            </button>
          </div>
        )}

        <button className="link-button" type="button" onClick={() => onNavigate(publicLeaguePath)}>
          Volver a la liga publica
        </button>
      </section>
    </main>
  );
}

function AccessSelectionPage({ currentUser, onNavigate, onSelectAccess, store }) {
  const accessOptions = buildAccessOptions(currentUser, store);

  if (!currentUser) {
    return (
      <main className="page access-page">
        <section className="access-card">
          <span className="eyebrow">Acceso requerido</span>
          <h1>Inicia sesion para elegir tu acceso</h1>
          <p>Primero entra con tu correo y contrasena. Despues LIGATEC mostrara los roles disponibles.</p>
          <button className="primary" type="button" onClick={() => onNavigate("/acceso")}>Ir a Acceso LIGATEC</button>
        </section>
      </main>
    );
  }

  return (
    <main className="page access-page">
      <section className="access-card access-selection-card">
        <div className="access-card-head">
          <span className="brand-mark brand-mark-logo access-logo"><img alt="" src={ligatecLogo} /></span>
          <div>
            <span className="eyebrow">Sesion activa</span>
            <h1>Selecciona como deseas ingresar</h1>
            <p>Elige el rol, liga o equipo con el que vas a trabajar en esta sesion.</p>
          </div>
        </div>

        {accessOptions.length ? (
          <div className="access-option-grid">
            {accessOptions.map((option) => (
              <article className="access-option-card" key={option.id}>
                <span>{option.roleLabel}</span>
                <strong>{option.leagueName}</strong>
                {option.teamName && <small>Equipo: {option.teamName}</small>}
                {!option.teamName && option.role === "team_delegate" && <small>Equipo asignado</small>}
                <button className="primary" type="button" onClick={() => onSelectAccess(option)}>Entrar</button>
              </article>
            ))}
          </div>
        ) : (
          <p className="auth-error inline-feedback">Tu usuario no tiene accesos activos. Solicita revision al administrador de la liga.</p>
        )}

        <button className="link-button" type="button" onClick={() => onNavigate("/acceso")}>Volver al acceso</button>
      </section>
    </main>
  );
}

function App() {
  const [store, setStore] = useState(initialStore);
  const [routePath, setRoutePath] = useState(window.location.pathname);
  const [adminPanel, setAdminPanel] = useState("league");
  const [apiStatus, setApiStatus] = useState("checking");
  const [initialApiLoaded, setInitialApiLoaded] = useState(false);
  const [auth, setAuth] = useState(initialAuth);
  const [selectedAccess, setSelectedAccess] = useState(initialSelectedAccess);
  const [userListRefreshKey, setUserListRefreshKey] = useState(0);
  const pendingPersistRef = useRef(null);
  const persistRunningRef = useRef(false);
  const isAdminRoute = isAdminPath(routePath);
  const isTeamRoute = isTeamPath(routePath);
  const isRefereeRoute = isRefereePath(routePath);
  const isAccessRoute = isAccessPath(routePath);
  const isAccessSelectionRoute = isAccessSelectionPath(routePath);
  const isPrivateRoute = isAdminRoute || isTeamRoute || isRefereeRoute || isAccessRoute || isAccessSelectionRoute;
  const publicLeagueId = !isPrivateRoute ? getPublicLeagueIdFromPath(routePath) : "";
  const legalLeagueId = !isPrivateRoute ? getLegalLeagueIdFromPath(routePath) : "";
  const delegateActivationToken = !isPrivateRoute ? getDelegateActivationTokenFromPath(routePath) : "";
  const refereeActivationToken = !isPrivateRoute ? getRefereeActivationTokenFromPath(routePath) : "";
  const adminActivationToken = !isPrivateRoute ? getAdminActivationTokenFromPath(routePath) : "";
  const routeLeagueId = publicLeagueId || legalLeagueId;
  const league = useMemo(() => {
    if (!store.leagues.length) return null;
    if (routeLeagueId) return store.leagues.find((item) => item.id === routeLeagueId) || getCurrentLeague(store);
    return getCurrentLeague(store);
  }, [routeLeagueId, store]);
  const currentUser = auth.user;
  const activeAccessRole = selectedAccess?.role || currentUser?.role;
  const activeAccessLeagueId = selectedAccess?.leagueId || currentUser?.leagueId || "";
  const canUseSuperAdmin = activeAccessRole === "super_admin";
  const canUseLeagueAdmin = ["league_admin", "admin_limited"].includes(activeAccessRole) && (!activeAccessLeagueId || activeAccessLeagueId === league?.id) && league?.status === "active";
  const canUseAdmin = canUseSuperAdmin || canUseLeagueAdmin;
  const shouldRedirectAdminToTeamPortal = isAdminRoute && activeAccessRole === "team_delegate";
  const shouldRedirectAdminToRefereePortal = isAdminRoute && activeAccessRole === "referee";
  const shouldRedirectTeamPortalToOwnPanel = isTeamRoute && currentUser && activeAccessRole !== "team_delegate";
  const shouldRedirectRefereePortalToOwnPanel = isRefereeRoute && currentUser && activeAccessRole !== "referee";
  const publicLeaguePath = league?.id ? getPublicLeaguePath(league.id) : "/";
  const legalLeaguePath = league?.id ? getLegalLeaguePath(league.id) : "/legal";
  const isLegalRoute = routePath === "/legal" || routePath.startsWith("/legal/");
  const isDelegateActivationRoute = routePath.startsWith("/activar-delegado/");
  const isRefereeActivationRoute = routePath.startsWith("/activar-arbitro/");
  const isAdminActivationRoute = routePath.startsWith("/activar-admin/");

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
        const sessionLeagueId = initialSelectedAccess?.leagueId ||
          (initialAuth.user?.role === "league_admin" ? initialAuth.user.leagueId : "");
        const preferredLeagueId = routeLeagueId ||
          (apiStore.leagues?.some((item) => item.id === sessionLeagueId) ? sessionLeagueId : "") ||
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
      .catch((sessionError) => {
        if (![401, 403].includes(sessionError.status) && auth.user) {
          setApiStatus("offline");
          return;
        }
        setAuth({ token: "", user: null });
        clearAuth();
      });
  }, [auth.token]);

  useEffect(() => {
    if (adminPanel === "super" && !canUseSuperAdmin) setAdminPanel("league");
  }, [adminPanel, canUseSuperAdmin]);

  useEffect(() => {
    if (shouldRedirectAdminToTeamPortal) navigateTo("/panel/delegado");
    if (shouldRedirectAdminToRefereePortal) navigateTo("/panel/arbitro");
    if (shouldRedirectTeamPortalToOwnPanel) navigateTo(getPanelPathForRole(activeAccessRole));
    if (shouldRedirectRefereePortalToOwnPanel) navigateTo(getPanelPathForRole(activeAccessRole));
  }, [shouldRedirectAdminToTeamPortal, shouldRedirectAdminToRefereePortal, shouldRedirectTeamPortalToOwnPanel, shouldRedirectRefereePortalToOwnPanel, activeAccessRole]);

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

  function selectAccess(option, sourceStore = store) {
    if (!option) return;
    const nextAccess = { ...option, selectedAt: new Date().toISOString() };
    setSelectedAccess(nextAccess);
    saveSelectedAccess(nextAccess);
    if (option.leagueId && sourceStore.leagues.some((item) => item.id === option.leagueId)) {
      const normalized = normalizeStore({ ...sourceStore, currentLeagueId: option.leagueId });
      setStore(normalized);
      saveStore(normalized);
    }
    navigateTo(option.path || getPanelPathForRole(option.role));
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
    const accessOptions = buildAccessOptions(nextAuth.user, normalizedStore);
    if (accessOptions.length === 1) {
      selectAccess(accessOptions[0], normalizedStore);
    } else if (accessOptions.length > 1) {
      navigateTo("/seleccionar-acceso");
    } else {
      navigateTo("/acceso");
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
    const accessOptions = buildAccessOptions(nextAuth.user, normalizedStore);
    selectAccess(accessOptions[0] || { role: "team_delegate", path: "/panel/delegado" }, normalizedStore);
  }

  async function completeRefereeActivation(nextAuth) {
    const apiStore = await fetchStoreFromApi(nextAuth.token);
    const normalizedStore = normalizeStore(apiStore);
    setAuth(nextAuth);
    saveAuth(nextAuth);
    setStore(normalizedStore);
    saveStore(normalizedStore);
    setApiStatus("connected");
    const accessOptions = buildAccessOptions(nextAuth.user, normalizedStore);
    selectAccess(accessOptions[0] || { role: "referee", path: "/panel/arbitro" }, normalizedStore);
  }

  async function completeAdminActivation(nextAuth) {
    const apiStore = await fetchStoreFromApi(nextAuth.token);
    const normalizedStore = normalizeStore(apiStore);
    setAuth(nextAuth);
    saveAuth(nextAuth);
    setStore(normalizedStore);
    saveStore(normalizedStore);
    setApiStatus("connected");
    const accessOptions = buildAccessOptions(nextAuth.user, normalizedStore);
    if (accessOptions.length === 1) selectAccess(accessOptions[0], normalizedStore);
    else navigateTo("/seleccionar-acceso");
  }

  function logout() {
    setAuth({ token: "", user: null });
    setSelectedAccess(null);
    clearAuth();
    clearSelectedAccess();
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

  if (!initialApiLoaded && !league && !isPrivateRoute && !isDelegateActivationRoute && !isRefereeActivationRoute && !isAdminActivationRoute) {
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

  if (!league && !isPrivateRoute && !isLegalRoute && !isDelegateActivationRoute && !isRefereeActivationRoute && !isAdminActivationRoute) {
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

  if (shouldRedirectAdminToTeamPortal || shouldRedirectAdminToRefereePortal || shouldRedirectTeamPortalToOwnPanel || shouldRedirectRefereePortalToOwnPanel) {
    return <RouteFallback label="Redirigiendo acceso" />;
  }

  return (
    <div className={isPrivateRoute ? "app-shell admin-route-shell" : "app-shell public-route-shell"} style={themeStyle}>
      <header className={`topbar ${isPrivateRoute ? "admin-topbar" : "public-topbar"}`}>
        <a className="brand" href={isAdminRoute ? "/panel/admin" : publicLeaguePath} aria-label="Ir al inicio" onClick={(event) => {
          event.preventDefault();
          navigateTo(isAdminRoute ? "/panel/admin" : isTeamRoute ? "/panel/delegado" : isRefereeRoute ? "/panel/arbitro" : publicLeaguePath);
        }}>
          <span className="brand-mark brand-mark-logo"><img alt="" src={ligatecLogo} /></span>
          <span className="brand-copy">
            <strong className="brand-wordmark">LIGA<span>TEC</span></strong>
            <small>PLATAFORMA DEPORTIVA</small>
          </span>
        </a>
        <div className="topbar-actions">
          {!isPrivateRoute && (
            <a className="access-ligatec-link" href="/acceso" onClick={(event) => {
              event.preventDefault();
              navigateTo("/acceso");
            }}>
              <span className="access-link-mark" aria-hidden="true" />
              <span>
                <strong>Acceso LIGATEC</strong>
                <small>Iniciar sesion</small>
              </span>
            </a>
          )}
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

      {isAccessRoute ? (
        <AccessPage
          currentUser={currentUser}
          onLogin={login}
          onLogout={logout}
          onNavigate={navigateTo}
          onSelectAccess={selectAccess}
          publicLeaguePath={publicLeaguePath}
          store={store}
        />
      ) : isAccessSelectionRoute ? (
        <AccessSelectionPage
          currentUser={currentUser}
          onNavigate={navigateTo}
          onSelectAccess={selectAccess}
          store={store}
        />
      ) : isAdminRoute && !canUseAdmin ? (
        <AccessPage
          currentUser={currentUser}
          onLogin={login}
          onLogout={logout}
          onNavigate={navigateTo}
          onSelectAccess={selectAccess}
          publicLeaguePath={publicLeaguePath}
          store={store}
        />
      ) : isTeamRoute && activeAccessRole !== "team_delegate" ? (
        <AccessPage
          currentUser={currentUser}
          onLogin={login}
          onLogout={logout}
          onNavigate={navigateTo}
          onSelectAccess={selectAccess}
          publicLeaguePath={publicLeaguePath}
          store={store}
        />
      ) : isRefereeRoute && activeAccessRole !== "referee" ? (
        <AccessPage
          currentUser={currentUser}
          onLogin={login}
          onLogout={logout}
          onNavigate={navigateTo}
          onSelectAccess={selectAccess}
          publicLeaguePath={publicLeaguePath}
          store={store}
        />
      ) : isDelegateActivationRoute ? (
        <Suspense fallback={<RouteFallback label="Cargando activacion" />}>
          <LazyDelegateActivationView token={delegateActivationToken} onActivated={completeDelegateActivation} onNavigate={navigateTo} />
        </Suspense>
      ) : isRefereeActivationRoute ? (
        <Suspense fallback={<RouteFallback label="Cargando activacion" />}>
          <LazyRefereeActivationView token={refereeActivationToken} onActivated={completeRefereeActivation} onNavigate={navigateTo} />
        </Suspense>
      ) : isAdminActivationRoute ? (
        <Suspense fallback={<RouteFallback label="Cargando activacion" />}>
          <LazyAdminActivationView token={adminActivationToken} onActivated={completeAdminActivation} onNavigate={navigateTo} />
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
            selectedAccess={selectedAccess}
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

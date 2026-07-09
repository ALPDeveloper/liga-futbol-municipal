import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import alpLogo from "../assets/alp-logo.png";
import iconJugadores from "../assets/icon-jugadores.png";
import iconLigas from "../assets/icon-ligas.png";
import iconPublico from "../assets/icon-publico.png";
import ligatecLogo from "../assets/ligatec-logo.png";
import heroImage from "../assets/league-hero.webp";
import { DEFAULT_IDENTITY } from "./data/seedData.js";
import { getCurrentLeague, normalizeStore } from "./lib/domain.js";
import { loadStore, saveStore } from "./lib/storage.js";
import { clearAuth, loadAuth, saveAuth } from "./lib/authStorage.js";
import { fetchSessionFromApi, fetchStoreFromApi, loginWithApi, persistStoreToApi } from "./lib/api.js";
import { IntroAnimation } from "./components/IntroAnimation.jsx";
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

function isLeagueDirectoryPath(path) {
  return path === "/ligas";
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
const ACCESS_RETURN_PATH_KEY = "ligatec:access-return-path";

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

function loadAccessReturnPath() {
  try {
    const saved = sessionStorage.getItem(ACCESS_RETURN_PATH_KEY) || "";
    return saved === "/" || saved === "/ligas" || saved.startsWith("/liga/") ? saved : "/";
  } catch {
    return "/";
  }
}

function saveAccessReturnPath(path) {
  try {
    const safePath = path === "/" || path === "/ligas" || path.startsWith("/liga/") ? path : "/";
    sessionStorage.setItem(ACCESS_RETURN_PATH_KEY, safePath);
  } catch {
    // Si sessionStorage falla, el acceso vuelve a portada por defecto.
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

function normalizeLandingSearch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getLeagueLandingStats(league) {
  const matches = league.matches || [];
  const scheduled = matches.filter((match) => match.status === "scheduled").length;
  const finished = matches.filter((match) => ["finished", "walkover"].includes(match.status)).length;
  const nextMatch = matches
    .filter((match) => match.status === "scheduled")
    .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")) || String(a.time || "").localeCompare(String(b.time || "")))[0];
  return {
    teams: league.teams?.length || 0,
    players: league.players?.length || 0,
    competitions: league.competitions?.length || 0,
    activeCompetitions: (league.competitions || []).filter((competition) => competition.status !== "archived").length,
    scheduled,
    finished,
    nextMatch
  };
}

function getLeagueInitials(name) {
  const words = String(name || "LT")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return (words.slice(0, 2).map((word) => word[0]).join("") || "LT").toUpperCase();
}

function LeagueDirectoryPage({ onNavigate, store }) {
  const [query, setQuery] = useState("");
  const activeLeagues = useMemo(
    () => (store.leagues || []).filter((league) => league.status !== "deleted"),
    [store.leagues]
  );
  const filteredLeagues = useMemo(() => {
    const search = normalizeLandingSearch(query);
    if (!search) return activeLeagues;
    return activeLeagues.filter((league) => {
      const searchable = [
        league.name,
        league.city,
        league.season,
        ...(league.competitions || []).map((competition) => `${competition.name} ${competition.season || ""}`),
        ...(league.teams || []).map((team) => team.name),
        ...(league.players || []).slice(0, 80).map((player) => player.name)
      ].join(" ");
      return normalizeLandingSearch(searchable).includes(search);
    });
  }, [activeLeagues, query]);

  function openLeague(leagueId) {
    if (!leagueId) return;
    saveLastPublicLeagueId(leagueId);
    onNavigate(getPublicLeaguePath(leagueId));
  }

  return (
    <main className="page landing-page league-directory-page">
      <section className="league-directory-hero">
        <div>
          <span className="eyebrow">Directorio publico</span>
          <h1>Ligas disponibles en LIGATEC</h1>
          <p>Encuentra tu municipio, torneo, equipo o jugador y entra directo a la informacion publica de cada liga.</p>
        </div>
        <button className="secondary" type="button" onClick={() => onNavigate("/")}>
          Volver al inicio
        </button>
      </section>

      <section className="landing-search-panel" id="ligas-disponibles">
        <div>
          <span className="eyebrow">Busca rapido</span>
          <h2>Elige la liga que quieres consultar</h2>
          <p>Usa el buscador o entra desde una tarjeta. No necesitas iniciar sesion para consultar la informacion publica.</p>
        </div>
        <label className="landing-search-box">
          <span>Buscar</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ej. Tinguindin, Guascuaro, Vasco Jr, jugador..."
            type="search"
          />
        </label>
      </section>

      <section className="landing-league-section" id="directorio-ligas" aria-label="Seleccionar liga">
        <div className="landing-section-head">
          <div>
            <span className="eyebrow">Entrar a una liga</span>
            <h2>Selecciona el municipio o torneo que quieres consultar.</h2>
          </div>
          <small>{filteredLeagues.length} disponible(s)</small>
        </div>
      </section>

      <section className="landing-league-grid">
        {filteredLeagues.map((league) => {
          const stats = getLeagueLandingStats(league);
          return (
            <article className="landing-league-card" key={league.id}>
              <div className="landing-card-top">
                <span className="landing-league-mark">{getLeagueInitials(league.name)}</span>
                <div className="landing-card-head">
                  <span>{league.city || "Municipio"}</span>
                  <strong>{league.name}</strong>
                  <small>{league.season || "Temporada activa"} | Consulta publica</small>
                </div>
                <span className={`landing-status ${league.status === "active" ? "is-active" : ""}`}>{league.status === "active" ? "Activa" : "Pausada"}</span>
              </div>
              <div className="landing-card-stats">
                <span><strong>{stats.teams}</strong> equipos</span>
                <span><strong>{stats.players}</strong> jugadores</span>
                <span><strong>{stats.scheduled}</strong> programados</span>
              </div>
              <div className="landing-next-match landing-league-summary">
                <span>Informacion disponible</span>
                <strong>Resultados, tabla, goleo y disciplina</strong>
                <small>{stats.activeCompetitions || stats.competitions} torneo(s) activo(s) | {stats.finished} partido(s) finalizado(s)</small>
              </div>
              <div className="landing-card-competitions">
                <span>Calendario</span>
                <span>Estadisticas</span>
                <span>Avisos</span>
                <span>Equipos</span>
              </div>
              <div className="landing-card-actions">
                <button className="primary" type="button" onClick={() => openLeague(league.id)}>
                  Entrar
                </button>
              </div>
            </article>
          );
        })}
        {!filteredLeagues.length && (
          <article className="landing-empty">
            <strong>No encontramos coincidencias</strong>
            <span>Intenta buscar por municipio, nombre de liga, equipo o jugador.</span>
          </article>
        )}
      </section>
    </main>
  );
}

function LandingPage({ onNavigate, store }) {
  const whatsappUrl = "https://wa.me/523541073146?text=Hola%2C%20quiero%20informaci%C3%B3n%20sobre%20LIGATEC.";
  const activeLeagues = useMemo(
    () => (store.leagues || []).filter((league) => league.status !== "deleted"),
    [store.leagues]
  );
  const globalStats = useMemo(() => activeLeagues.reduce((summary, league) => {
    const stats = getLeagueLandingStats(league);
    return {
      leagues: summary.leagues + 1,
      teams: summary.teams + stats.teams,
      players: summary.players + stats.players,
      matches: summary.matches + (league.matches?.length || 0)
    };
  }, { leagues: 0, teams: 0, players: 0, matches: 0 }), [activeLeagues]);
  const featuredLeague = activeLeagues.find((item) => item.status === "active") || activeLeagues[0] || null;
  const featuredStats = featuredLeague ? getLeagueLandingStats(featuredLeague) : null;
  const featuredCompetition = featuredLeague
    ? ((featuredLeague.competitions || []).find((competition) => competition.status !== "archived") || featuredLeague.competitions?.[0])
    : null;
  const featuredMatch = featuredStats?.nextMatch;
  const featuredHomeTeam = featuredMatch ? (featuredLeague.teams || []).find((team) => team.id === featuredMatch.homeTeamId)?.name || "Local" : "Local";
  const featuredAwayTeam = featuredMatch ? (featuredLeague.teams || []).find((team) => team.id === featuredMatch.awayTeamId)?.name || "Visitante" : "Visitante";

  function openLeagueDirectory() {
    onNavigate("/ligas");
    window.setTimeout(() => {
      document.getElementById("directorio-ligas")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }

  return (
    <main className="page landing-page">
      <IntroAnimation />
      <section className="landing-hero">
        <div className="landing-hero-copy">
          <span className="eyebrow">Hecho en Michoacan</span>
          <h1>Consulta tu liga, tu equipo o tu jugador en segundos.</h1>
          <p>
            LIGATEC es una plataforma publica para aficionados, jugadores, familias y equipos. Entra a la liga de tu municipio y revisa resultados, tabla, goleo, sanciones y avisos sin complicarte.
          </p>
          <div className="landing-actions">
            <button className="primary" type="button" onClick={openLeagueDirectory}>
              Ver ligas disponibles
            </button>
            <a className="secondary" href={whatsappUrl} rel="noreferrer" target="_blank">Contacto</a>
          </div>
          <div className="landing-field-strip" aria-label="Areas principales de LIGATEC">
            <span>Municipios</span>
            <span>Torneos</span>
            <span>Equipos</span>
            <span>Jugadores</span>
          </div>
        </div>
        <div className="landing-hero-panel" aria-label="Resumen LIGATEC">
          <div className="landing-live-card">
            <div className="landing-live-head">
              <span>Vista publica</span>
              <strong>{featuredLeague?.city || "Futbol regional"}</strong>
              <small>{featuredCompetition ? `${featuredCompetition.name} | ${featuredCompetition.season || featuredLeague?.season}` : "Temporada activa"}</small>
            </div>
            <div className="landing-score-preview">
              <span>{featuredHomeTeam}</span>
              <b>VS</b>
              <span>{featuredAwayTeam}</span>
            </div>
            <div className="landing-mini-grid">
              <span><strong>{featuredStats?.teams || globalStats.teams}</strong> equipos</span>
              <span><strong>{featuredStats?.players || globalStats.players}</strong> jugadores</span>
              <span><strong>{featuredStats?.scheduled || 0}</strong> por jugar</span>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-regional-platform">
        <div className="landing-regional-copy">
          <span className="eyebrow">Futbol regional, datos claros</span>
          <h2>Futbol local con informacion clara.</h2>
          <p>
            Resultados, tablas, goleadores, sanciones y avisos disponibles para jugadores, familias y aficionados desde el celular.
          </p>
          <div className="landing-tech-tags">
            <span>Resultados</span>
            <span>Tabla</span>
            <span>Goleo</span>
            <span>Disciplina</span>
          </div>
          <div className="landing-regional-metrics">
            <article>
              <span className="landing-benefit-icon"><img alt="" src={iconPublico} /></span>
              <strong>Publico</strong>
              <span>consulta facil</span>
            </article>
            <article>
              <span className="landing-benefit-icon"><img alt="" src={iconLigas} /></span>
              <strong>Ligas</strong>
              <span>control claro</span>
            </article>
            <article>
              <span className="landing-benefit-icon"><img alt="" src={iconJugadores} /></span>
              <strong>Jugadores</strong>
              <span>historial visible</span>
            </article>
          </div>
        </div>
        <div className="landing-platform-preview" aria-label="Vista ejemplo de plataforma publica">
          <div className="landing-preview-top">
            <span>Que resuelve</span>
            <strong>Todo el torneo en un solo lugar.</strong>
          </div>
          <div className="landing-preview-match">
            <span>Resultados visibles</span>
            <b>sin vueltas</b>
            <span>Estadisticas claras</span>
          </div>
          <div className="landing-preview-rows">
            <article><span>Para aficionados</span><strong>Consulta sin iniciar sesion</strong></article>
            <article><span>Para ligas</span><strong>Administracion ordenada</strong></article>
            <article><span>Para torneos</span><strong>Informacion siempre disponible</strong></article>
          </div>
        </div>
      </section>

      <section className="landing-contact-band">
        <div>
          <span className="eyebrow">Contacto</span>
          <h2>¿Quieres llevar tu liga a LIGATEC?</h2>
          <p>Escríbenos por WhatsApp para revisar tu torneo, municipio o proyecto deportivo.</p>
        </div>
        <a className="primary" href={whatsappUrl} rel="noreferrer" target="_blank">Enviar WhatsApp</a>
      </section>

      <footer className="landing-footer">
        <section className="landing-footer-hero" aria-label="Resumen LIGATEC">
          <span className="landing-footer-logo"><img alt="" src={ligatecLogo} /></span>
          <div>
            <strong>LIGA<span>TEC</span></strong>
            <small>PLATAFORMA DEPORTIVA</small>
          </div>
          <p><b>La evolucion digital de tu liga.</b> Administracion, estadisticas y transparencia para llevar el futbol local a otro nivel.</p>
        </section>

        <section className="landing-footer-accordion" aria-label="Informacion de LIGATEC">
          <details>
            <summary>
              <span className="footer-section-icon">➤</span>
              <strong>Navegacion</strong>
            </summary>
            <div className="footer-section-body">
              <button type="button" onClick={() => onNavigate("/ligas")}>Ligas disponibles</button>
              <button type="button" onClick={() => onNavigate("/legal")}>Terminos y privacidad</button>
              <a href={whatsappUrl} rel="noreferrer" target="_blank">Contacto por WhatsApp</a>
            </div>
          </details>
          <details>
            <summary>
              <span className="footer-section-icon">?</span>
              <strong>Recursos</strong>
            </summary>
            <div className="footer-section-body footer-info-list">
              <span>Consulta publica de resultados, tablas y calendarios.</span>
              <span>Perfiles de jugadores, goleo, sanciones y equipos.</span>
              <span>Acceso centralizado para administradores, delegados y arbitros.</span>
            </div>
          </details>
          <details>
            <summary>
              <span className="footer-section-icon">▥</span>
              <strong>Plataforma</strong>
            </summary>
            <div className="footer-section-body footer-info-list">
              <span>Diseñada para ligas municipales y torneos locales.</span>
              <span>Optimizada para consulta movil y uso operativo.</span>
              <span>Preparada para crecer con nuevas ligas y municipios.</span>
            </div>
          </details>
          <details>
            <summary>
              <span className="footer-section-icon">☎</span>
              <strong>Contacto</strong>
            </summary>
            <div className="footer-section-body footer-info-list">
              <span>WhatsApp: 354 107 3146</span>
              <span>Atencion para ligas, municipios y proyectos deportivos.</span>
            </div>
          </details>
        </section>

        <section className="landing-footer-support" aria-label="Soporte LIGATEC">
          <div>
            <span className="footer-support-icon">☎</span>
            <div>
              <strong>¿Necesitas ayuda?</strong>
              <p>Estamos listos para revisar tu liga, resolver dudas o preparar tu torneo en LIGATEC.</p>
            </div>
          </div>
          <a href={whatsappUrl} rel="noreferrer" target="_blank">
            <span>WhatsApp</span>
            <strong>354 107 3146</strong>
          </a>
        </section>

        <section className="landing-footer-dev" aria-label="Desarrollador">
          <span>Desarrollado por</span>
          <img alt="ALP DEV" src={alpLogo} />
        </section>

        <section className="landing-footer-security" aria-label="Seguridad">
          <span className="footer-security-icon">▣</span>
          <div>
            <strong>Plataforma segura y confiable</strong>
            <small>Tus datos estan protegidos y se administran con buenas practicas.</small>
          </div>
        </section>

        <div className="landing-footer-bottom">
          <small>© {new Date().getFullYear()} LIGATEC. Todos los derechos reservados.</small>
          <small>Hecho en Michoacan para el futbol local.</small>
        </div>
      </footer>
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
  const [accessReturnPath, setAccessReturnPath] = useState(loadAccessReturnPath);
  const [userListRefreshKey, setUserListRefreshKey] = useState(0);
  const pendingPersistRef = useRef(null);
  const persistRunningRef = useRef(false);
  const isAdminRoute = isAdminPath(routePath);
  const isTeamRoute = isTeamPath(routePath);
  const isRefereeRoute = isRefereePath(routePath);
  const isAccessRoute = isAccessPath(routePath);
  const isAccessSelectionRoute = isAccessSelectionPath(routePath);
  const isLeagueDirectoryRoute = isLeagueDirectoryPath(routePath);
  const isLandingRoute = routePath === "/";
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
  const showPublicHomeLink = !isPrivateRoute && !isLandingRoute && !isLeagueDirectoryRoute && !isLegalRoute && !isDelegateActivationRoute && !isRefereeActivationRoute && !isAdminActivationRoute;
  const showPublicLegalLink = !isLandingRoute;
  const contextualPublicReturnPath = isLeagueDirectoryRoute ? "/ligas" : (publicLeagueId || legalLeagueId ? publicLeaguePath : "/");
  const legalPublicReturnPath = legalLeagueId ? publicLeaguePath : "/";
  const privatePublicReturnPath = isAccessRoute || isAccessSelectionRoute ? accessReturnPath : publicLeaguePath;
  const legalNavPath = isLandingRoute || isLeagueDirectoryRoute ? "/legal" : legalLeaguePath;

  function navigateTo(path) {
    window.history.pushState({}, "", path);
    setRoutePath(window.location.pathname);
  }

  function navigateToAccess() {
    const returnPath = contextualPublicReturnPath;
    saveAccessReturnPath(returnPath);
    setAccessReturnPath(returnPath);
    navigateTo("/acceso");
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
    navigateTo(isLandingRoute ? "/" : publicLeaguePath);
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
          <strong>{isLandingRoute ? "Cargando LIGATEC" : "Cargando liga"}</strong>
          <small>{isLandingRoute ? "Preparando ligas y municipios disponibles." : "Preparando calendario, tabla y estadisticas."}</small>
        </div>
      </main>
    );
  }

  if (!league && !isPrivateRoute && !isLegalRoute && !isDelegateActivationRoute && !isRefereeActivationRoute && !isAdminActivationRoute) {
    return (
      <main className="startup-screen">
        <div className="startup-card">
          <span className="brand-mark brand-mark-logo"><img alt="" src={ligatecLogo} /></span>
          <strong>{isLandingRoute ? "No se pudieron cargar ligas" : "No se pudieron cargar datos reales"}</strong>
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
        <a className="brand" href={isAdminRoute ? "/panel/admin" : "/"} aria-label="Ir al inicio" onClick={(event) => {
          event.preventDefault();
          navigateTo(isAdminRoute ? "/panel/admin" : isTeamRoute ? "/panel/delegado" : isRefereeRoute ? "/panel/arbitro" : "/");
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
              navigateToAccess();
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
              <span>{isLandingRoute ? "Inicio" : isLeagueDirectoryRoute ? "Directorio" : "Liga"}</span>
              <strong>{isLandingRoute ? "LIGATEC" : isLeagueDirectoryRoute ? "Ligas disponibles" : isLegalRoute ? "Aviso legal" : league?.name || "Cargando"}</strong>
            </div>
          )}
          {!isPrivateRoute && (
            <>
              {showPublicHomeLink && (
                <a className="admin-public-link public-home-link" href="/" onClick={(event) => {
                  event.preventDefault();
                  navigateTo("/");
                }}>
                  Inicio
                </a>
              )}
              {showPublicLegalLink && (
                <a className="admin-public-link" href={isLegalRoute ? legalPublicReturnPath : legalNavPath} onClick={(event) => {
                  event.preventDefault();
                  navigateTo(isLegalRoute ? legalPublicReturnPath : legalNavPath);
                }}>
                  {isLegalRoute ? (legalLeagueId ? "Vista liga" : "Inicio") : "Legal"}
                </a>
              )}
            </>
          )}
          {isPrivateRoute && (
            <>
              {(league?.id || isAccessRoute || isAccessSelectionRoute) && <a className="admin-public-link" href={privatePublicReturnPath} onClick={(event) => {
                event.preventDefault();
                navigateTo(privatePublicReturnPath);
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
          publicLeaguePath={accessReturnPath}
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
          <LazyLegalView league={legalLeagueId ? league : null} onNavigate={navigateTo} publicLeaguePath={legalPublicReturnPath} />
        </Suspense>
      ) : isLeagueDirectoryRoute ? (
        <LeagueDirectoryPage onNavigate={navigateTo} store={store} />
      ) : isLandingRoute ? (
        <LandingPage onNavigate={navigateTo} store={store} />
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

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import alpLogo from "../../assets/alp-logo.png";
import stadiumHero from "../../assets/public-home-stadium.jpg";
import ligatecLogo from "../../assets/ligatec-logo.png";
import {
  calculatePlayerStats,
  calculateStandings,
  calculateSuspensionNotices,
  calculateYellowCardDiscipline,
  buildSmartHighlights,
  finishedMatches,
  formatDate,
  getCompetition,
  getCurrentDisplayRound,
  getDefaultCompetitionId,
  getEligiblePlayersForTeam,
  getIdentityTags,
  getPlayer,
  getPlayerAffiliationForTeam,
  getPlayerNumberForTeam,
  getPlayerSeasonBreakdown,
  getPlayoffPhaseLabel,
  getTeam,
  isAccumulatingYellowCard,
  playoffMatches,
  regularMatches,
  scopeLeagueToCompetition
} from "../lib/domain.js";
import { SectionHeading } from "./SectionHeading.jsx";

function getPublicCompetitionStorageKey(leagueId) {
  return `ligatec:lastCompetition:${leagueId}`;
}

function loadLastCompetitionId(league) {
  const publicCompetitions = getPublicCompetitions(league);
  try {
    const params = new URLSearchParams(window.location.search);
    const urlCompetitionId = params.get("torneo") || params.get("competition") || params.get("categoria") || "";
    if (publicCompetitions.some((competition) => competition.id === urlCompetitionId)) return urlCompetitionId;
    const competitionId = localStorage.getItem(getPublicCompetitionStorageKey(league.id)) || "";
    return publicCompetitions.some((competition) => competition.id === competitionId) ? competitionId : "";
  } catch {
    return "";
  }
}

function hasExplicitUrlCompetition(league) {
  const publicCompetitions = getPublicCompetitions(league);
  try {
    const params = new URLSearchParams(window.location.search);
    const urlCompetitionId = params.get("torneo") || params.get("competition") || params.get("categoria") || "";
    return publicCompetitions.some((competition) => competition.id === urlCompetitionId);
  } catch {
    return false;
  }
}

function saveLastCompetitionId(leagueId, competitionId) {
  try {
    if (leagueId && competitionId) localStorage.setItem(getPublicCompetitionStorageKey(leagueId), competitionId);
  } catch {
    // Preferencia publica opcional; si el navegador no deja guardar, la app sigue funcionando.
  }
}

const COMPETITION_ACCENTS = ["#28a85a", "#1368d8", "#f97316", "#a855f7", "#eab308", "#0f9ca5", "#dc2626", "#0891b2"];
const PUBLIC_APP_VIEWS = [
  { id: "inicio", label: "Inicio", icon: "home" },
  { id: "calendario", label: "Partidos", icon: "matches" },
  { id: "tabla", label: "Tabla", icon: "table" },
  { id: "equipos", label: "Equipos", icon: "team" },
  { id: "mas", label: "Más", icon: "more" }
];
const PUBLIC_SCREEN_VIEWS = new Set([...PUBLIC_APP_VIEWS.map((view) => view.id), "partido", "fotos", "patrocinadores"]);

function getPublicViewFromHash(hashValue = "") {
  const hash = String(hashValue || "").replace("#", "");
  if (hash === "goleo" || hash === "disciplina" || hash === "expulsiones") return "tabla";
  if (hash === "jugador" || hash === "equipo") return "equipos";
  if (hash === "liguilla") return "mas";
  if (hash === "fotos") return "fotos";
  if (hash === "patrocinadores") return "patrocinadores";
  if (hash === "partido") return "partido";
  return PUBLIC_APP_VIEWS.some((view) => view.id === hash) ? hash : "inicio";
}

function getTeamsPanelFromHash(hashValue = "") {
  const hash = String(hashValue || "").replace("#", "");
  if (hash === "jugador") return "jugador";
  if (hash === "equipo") return "equipo";
  return "equipos";
}

function getStatsPanelFromHash(hashValue = "") {
  const hash = String(hashValue || "").replace("#", "");
  if (hash === "goleo") return "goleo";
  if (hash === "disciplina") return "disciplina";
  if (hash === "expulsiones") return "expulsiones";
  return "tabla";
}

function getCompetitionAccent(competitions, competitionId) {
  const index = Math.max(0, competitions.findIndex((competition) => competition.id === competitionId));
  return COMPETITION_ACCENTS[index % COMPETITION_ACCENTS.length];
}

function getPublicCompetitions(league) {
  return (league.competitions || []).filter((competition) => !["archived", "hidden"].includes(competition.status));
}

function getCompetitionScopedPublicAssets(items = [], competitionId = "") {
  const scopedItems = items.filter((item) => (item.competitionId || "") === competitionId);
  if (competitionId && scopedItems.length) return scopedItems;
  return items.filter((item) => !item.competitionId);
}

function getArchivedPublicCompetitions(league) {
  return (league.competitions || []).filter((competition) => competition.status === "archived");
}

function hasTournamentSelector(league) {
  return getPublicCompetitions(league).length > 1;
}

function getSeasonValue(competition, league) {
  return competition?.season || league?.season || "Temporada actual";
}

function getSeasonId(value) {
  const slug = normalizeSearchTerm(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `season-${slug || "actual"}`;
}

function updatePublicCompetitionUrl(league, competition, options = {}) {
  try {
    if (!competition) return;
    const { preserveHash = false } = options;
    const url = new URL(window.location.href);
    url.searchParams.set("temporada", getSeasonId(getSeasonValue(competition, league)));
    url.searchParams.set("torneo", competition.id);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${preserveHash ? url.hash : ""}`);
  } catch {
    // Si el navegador no permite modificar la URL, la seleccion local sigue funcionando.
  }
}

function clearPublicHash() {
  try {
    if (!window.location.hash) return;
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    window.dispatchEvent(new Event("hashchange"));
  } catch {
    // El hash es solo navegacion local; si no se puede limpiar, el contenido sigue disponible.
  }
}

function forcePublicScrollTop() {
  if (typeof window === "undefined") return;
  const scrollTop = () => {
    clearPublicHash();
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  };
  scrollTop();
  window.requestAnimationFrame(scrollTop);
  window.setTimeout(scrollTop, 90);
}

export function PublicView({ heroImage, legalPath = "/legal", league, onNavigate, onEntryModeChange }) {
  const [showIntro, setShowIntro] = useState(true);
  const [publicSearch, setPublicSearch] = useState("");
  const [isPublicSearchOpen, setPublicSearchOpen] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [selectedPublicMatchId, setSelectedPublicMatchId] = useState("");
  const [activePublicView, setActivePublicView] = useState(() => (
    typeof window === "undefined" ? "inicio" : getPublicViewFromHash(window.location.hash)
  ));
  const [activeTeamsPanel, setActiveTeamsPanel] = useState(() => (
    typeof window === "undefined" ? "equipos" : getTeamsPanelFromHash(window.location.hash)
  ));
  const [activeStatsPanel, setActiveStatsPanel] = useState(() => (
    typeof window === "undefined" ? "tabla" : getStatsPanelFromHash(window.location.hash)
  ));
  const [selectedCompetitionId, setSelectedCompetitionId] = useState(() => loadLastCompetitionId(league) || getDefaultCompetitionId(league));
  const [isCompetitionSheetOpen, setCompetitionSheetOpen] = useState(false);
  const [showCompetitionGate, setShowCompetitionGate] = useState(() => (
    hasTournamentSelector(league) && !hasExplicitUrlCompetition(league)
  ));
  const activeLeague = useMemo(
    () => scopeLeagueToCompetition(league, selectedCompetitionId),
    [league, selectedCompetitionId]
  );
  const regularLeague = useMemo(() => ({ ...activeLeague, matches: regularMatches(activeLeague) }), [activeLeague]);
  const scopedPublicMedia = useMemo(
    () => getCompetitionScopedPublicAssets(league.media || [], selectedCompetitionId),
    [league.media, selectedCompetitionId]
  );
  const scopedPublicSponsors = useMemo(
    () => getCompetitionScopedPublicAssets(league.sponsors || [], selectedCompetitionId),
    [league.sponsors, selectedCompetitionId]
  );
  const publicContentLeague = useMemo(
    () => ({ ...regularLeague, media: scopedPublicMedia, sponsors: scopedPublicSponsors }),
    [regularLeague, scopedPublicMedia, scopedPublicSponsors]
  );
  const playoffs = useMemo(() => playoffMatches(activeLeague), [activeLeague]);
  const activeCompetition = getCompetition(league, selectedCompetitionId);
  const competitionAccent = getCompetitionAccent(league.competitions || [], selectedCompetitionId);
  const publicCompetitions = getPublicCompetitions(league);
  const archivedPublicCompetitions = getArchivedPublicCompetitions(league);
  const hasMultipleCompetitions = publicCompetitions.length > 1;
  const [selectedSeason, setSelectedSeason] = useState(activeCompetition?.season || league.season);
  const [matchSearchQuery, setMatchSearchQuery] = useState("");
  const [focusedMatchId, setFocusedMatchId] = useState("");
  const standings = calculateStandings(regularLeague);
  const stats = calculatePlayerStats(activeLeague);
  const leagueWideStats = useMemo(() => calculatePlayerStats(league), [league]);
  const scheduledMatches = sortPublicMatches(regularLeague.matches.filter(isPublicPlayableScheduledMatch));
  const nextMatches = scheduledMatches.slice(0, 4);
  const latestResults = sortRecentMatches(finishedMatches(regularLeague)).slice(0, 3);
  const featuredMatch = getFeaturedPublicMatch(regularLeague, standings);
  const disciplineLeague = league.rules?.disciplineScope === "league" ? league : activeLeague;
  const rounds = useMemo(() => (
    [...new Set(regularLeague.matches.map((match) => Number(match.round || 0)).filter(Boolean))]
      .sort((a, b) => a - b)
  ), [regularLeague.matches]);
  const defaultRound = useMemo(() => (
    getNextPlayableRound(regularLeague.matches, rounds) ||
    (activeCompetition?.activeRound && rounds.includes(Number(activeCompetition.activeRound))
      ? activeCompetition.activeRound
      : "") ||
    getCurrentDisplayRound(regularLeague.matches) ||
    rounds.at(-1) ||
    ""
  ), [activeCompetition?.activeRound, regularLeague.matches, rounds]);
  const [selectedRound, setSelectedRound] = useState(defaultRound);
  const selectedRoundMatches = useMemo(() => (
    regularLeague.matches
      .filter((match) => Number(match.round) === Number(selectedRound))
      .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.time).localeCompare(String(b.time)))
  ), [regularLeague.matches, selectedRound]);
  const matchSearchResults = useMemo(() => (
    getRoundMatchSearchResults(activeLeague, selectedRoundMatches, matchSearchQuery)
  ), [activeLeague, matchSearchQuery, selectedRoundMatches]);
  const matchDayGroups = useMemo(() => (
    groupPublicMatchesByDay(selectedRoundMatches)
  ), [selectedRoundMatches]);
  const restingTeams = useMemo(() => {
    if (!selectedRoundMatches.length) return [];
    const competitionTeamIds = new Set(
      regularLeague.matches.flatMap((match) => [match.homeTeamId, match.awayTeamId])
    );
    const playingTeamIds = new Set(
      selectedRoundMatches.flatMap((match) => [match.homeTeamId, match.awayTeamId])
    );

    return activeLeague.teams
      .filter((team) => competitionTeamIds.has(team.id) && !playingTeamIds.has(team.id) && team.status !== "withdrawn")
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [activeLeague.teams, regularLeague.matches, selectedRoundMatches]);
  const allScorers = useMemo(() => (
    stats
      .filter((row) => row.goals > 0)
      .sort((a, b) => b.goals - a.goals || a.player.name.localeCompare(b.player.name))
  ), [stats]);
  const scorers = allScorers.slice(0, 5);
  const discipline = calculateYellowCardDiscipline(disciplineLeague);
  const spotlights = useMemo(
    () => buildPublicSpotlights(activeLeague).filter((item) => item.label !== "Partido destacado"),
    [activeLeague]
  );
  const fairPlayTeams = useMemo(() => buildFairPlayTeams(activeLeague).slice(0, 4), [activeLeague]);
  const [selectedTeamId, setSelectedTeamId] = useState(activeLeague.teams[0]?.id || "");
  const selectedTeam = activeLeague.teams.find((team) => team.id === selectedTeamId) || activeLeague.teams[0] || null;
  const selectedPublicMatch = activeLeague.matches.find((match) => match.id === selectedPublicMatchId) || null;
  const suspensionNotices = calculateSuspensionNotices(disciplineLeague).filter((notice) => notice.status === "active");
  const activeInjuries = useMemo(() => (
    (activeLeague.injuries || [])
      .filter((injury) => injury.status === "active")
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
  ), [activeLeague]);
  const activeAnnouncements = useMemo(() => (
    (league.announcements || [])
      .filter((announcement) => announcement.status === "active" && announcement.body)
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
  ), [league.announcements]);
  const highlights = useMemo(() => (
    [...buildSmartHighlights(activeLeague), ...(league.highlights || [])]
      .filter((item) => item && !isSetupHighlight(item))
      .filter((item, index, items) => items.indexOf(item) === index)
      .slice(0, 6)
  ), [activeLeague, league.highlights]);
  const identityTags = getIdentityTags(league);
  const publicSearchResults = useMemo(
    () => getPublicSearchResults(league, leagueWideStats, publicSearch, selectedCompetitionId),
    [league, leagueWideStats, publicSearch, selectedCompetitionId]
  );
  const selectedPlayer = useMemo(() => (
    activeLeague.players.find((player) => player.id === selectedPlayerId) ||
    scorers[0]?.player ||
    activeLeague.players[0] ||
    null
  ), [activeLeague.players, scorers, selectedPlayerId]);

  function shareLeague() {
    shareWhatsAppItem({
      text: `${league.name} | ${activeCompetition?.name || league.season}`,
      url: window.location.href
    });
  }

  function selectPublicView(viewId, options = {}) {
    const nextView = PUBLIC_SCREEN_VIEWS.has(viewId) ? viewId : "inicio";
    if (options.round) {
      setSelectedRound(options.round);
      setMatchSearchQuery("");
      setFocusedMatchId("");
    } else if (nextView === "calendario" && !options.preserveRound) {
      setSelectedRound(defaultRound);
      setMatchSearchQuery("");
      setFocusedMatchId("");
    }
    if (options.teamsPanel) setActiveTeamsPanel(options.teamsPanel);
    if (nextView === "equipos" && !options.teamsPanel) setActiveTeamsPanel("equipos");
    if (options.statsPanel) setActiveStatsPanel(options.statsPanel);
    if (nextView === "tabla" && !options.statsPanel) setActiveStatsPanel("tabla");
    setActivePublicView(nextView);
    try {
      const hash = options.statsPanel || options.teamsPanel || nextView;
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${hash}`);
    } catch {
      // La vista publica funciona por estado; el hash solo ayuda a compartir la seccion.
    }
    window.requestAnimationFrame(() => {
      if (nextView === "calendario" || nextView === "partido" || nextView === "tabla" || nextView === "equipos" || nextView === "fotos") {
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
        return;
      }
      document.getElementById("torneo-app")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    window.setTimeout(() => {
      if (nextView === "calendario" || nextView === "partido" || nextView === "tabla" || nextView === "equipos" || nextView === "fotos") {
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
      }
    });
  }

  function selectPublicPlayer(playerId, teamId = "") {
    setSelectedPlayerId(playerId);
    if (teamId) setSelectedTeamId(teamId);
    selectPublicView("equipos", { teamsPanel: "jugador" });
  }

  function selectPublicTeam(teamId) {
    setSelectedTeamId(teamId);
    selectPublicView("equipos", { teamsPanel: "equipo" });
  }

  function selectPublicMatch(matchId) {
    setFocusedMatchId("");
    setSelectedPublicMatchId(matchId);
    selectPublicView("partido");
  }

  function selectRoundMatchSearchResult(matchId) {
    setFocusedMatchId(matchId);
    setMatchSearchQuery("");
    window.requestAnimationFrame(() => {
      document.querySelector(`[data-public-match-id="${CSS.escape(matchId)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  function selectCompetition(competitionId, options = {}) {
    const {
      clearHash = true,
      closeGate = true,
      scrollTop = true,
      updateUrl = true
    } = options;
    const nextCompetition = getCompetition(league, competitionId);
    if (clearHash) clearPublicHash();
    setSelectedCompetitionId(competitionId);
    setCompetitionSheetOpen(false);
    setPublicSearch("");
    setSelectedPlayerId("");
    setSelectedPublicMatchId("");
    setFocusedMatchId("");
    setMatchSearchQuery("");
    setActivePublicView("inicio");
    setActiveTeamsPanel("equipos");
    if (nextCompetition?.season) setSelectedSeason(nextCompetition.season);
    if (closeGate) setShowCompetitionGate(false);
    if (updateUrl) updatePublicCompetitionUrl(league, nextCompetition, { preserveHash: !clearHash });
    if (clearHash) clearPublicHash();
    if (scrollTop) forcePublicScrollTop();
  }

  function handlePublicSearchResult(result) {
    if (result.competitionId && result.competitionId !== selectedCompetitionId) {
      setSelectedCompetitionId(result.competitionId);
    }
    if (result.type === "team") {
      selectPublicTeam(result.id);
    }
    if (result.type === "player") {
      setSelectedPlayerId(result.id);
      selectPublicView("equipos", { teamsPanel: "jugador" });
    }
    if (result.type === "match" && result.round) {
      setSelectedRound(result.round);
      setSelectedPublicMatchId(result.id);
      selectPublicView("calendario", { round: result.round });
    }
    setPublicSearch("");
    setPublicSearchOpen(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => setShowIntro(false), 620);
    const fallbackTimer = window.setTimeout(() => setShowIntro(false), 1500);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(fallbackTimer);
    };
  }, []);

  useEffect(() => {
    const openCompetitionSheet = () => {
      if (hasMultipleCompetitions && !showCompetitionGate) setCompetitionSheetOpen(true);
    };
    window.addEventListener("ligatec:openCompetitionSheet", openCompetitionSheet);
    return () => window.removeEventListener("ligatec:openCompetitionSheet", openCompetitionSheet);
  }, [hasMultipleCompetitions, showCompetitionGate]);

  useEffect(() => {
    const openPublicSearch = () => {
      if (!showCompetitionGate) setPublicSearchOpen(true);
    };
    window.addEventListener("ligatec:openPublicSearch", openPublicSearch);
    return () => window.removeEventListener("ligatec:openPublicSearch", openPublicSearch);
  }, [showCompetitionGate]);

  useLayoutEffect(() => {
    if (!isPublicSearchOpen || typeof window === "undefined") return undefined;
    const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
    const previousBodyStyle = {
      overflow: document.body.style.overflow,
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width
    };
    const previousHtmlStyle = {
      overflow: document.documentElement.style.overflow,
      overscrollBehavior: document.documentElement.style.overscrollBehavior
    };
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    document.documentElement.style.overflow = "hidden";
    document.documentElement.style.overscrollBehavior = "none";
    return () => {
      document.body.style.overflow = previousBodyStyle.overflow;
      document.body.style.position = previousBodyStyle.position;
      document.body.style.top = previousBodyStyle.top;
      document.body.style.width = previousBodyStyle.width;
      document.documentElement.style.overflow = previousHtmlStyle.overflow;
      document.documentElement.style.overscrollBehavior = previousHtmlStyle.overscrollBehavior;
      window.scrollTo({ top: scrollY, left: 0, behavior: "auto" });
    };
  }, [isPublicSearchOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const syncViewFromHash = () => {
      setActivePublicView(getPublicViewFromHash(window.location.hash));
      if (getPublicViewFromHash(window.location.hash) === "equipos") {
        setActiveTeamsPanel(getTeamsPanelFromHash(window.location.hash));
      }
      if (getPublicViewFromHash(window.location.hash) === "tabla") {
        setActiveStatsPanel(getStatsPanelFromHash(window.location.hash));
      }
    };
    syncViewFromHash();
    window.addEventListener("hashchange", syncViewFromHash);
    return () => window.removeEventListener("hashchange", syncViewFromHash);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (activePublicView !== "calendario" && activePublicView !== "partido" && activePublicView !== "tabla" && activePublicView !== "fotos") return undefined;
    const forceTop = () => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };
    forceTop();
    const timers = [40, 140, 280].map((delay) => window.setTimeout(forceTop, delay));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [activePublicView, selectedPublicMatchId]);

  useEffect(() => {
    if (!focusedMatchId || typeof window === "undefined") return undefined;
    const clearFocusedMatch = () => setFocusedMatchId("");
    let cleanupEvents = () => {};
    const armTimer = window.setTimeout(() => {
      const options = { capture: true, passive: true };
      window.addEventListener("scroll", clearFocusedMatch, options);
      window.addEventListener("wheel", clearFocusedMatch, options);
      window.addEventListener("touchstart", clearFocusedMatch, options);
      window.addEventListener("pointerdown", clearFocusedMatch, options);
      window.addEventListener("keydown", clearFocusedMatch, true);
      cleanupEvents = () => {
        window.removeEventListener("scroll", clearFocusedMatch, options);
        window.removeEventListener("wheel", clearFocusedMatch, options);
        window.removeEventListener("touchstart", clearFocusedMatch, options);
        window.removeEventListener("pointerdown", clearFocusedMatch, options);
        window.removeEventListener("keydown", clearFocusedMatch, true);
      };
    }, 900);
    return () => {
      window.clearTimeout(armTimer);
      cleanupEvents();
    };
  }, [focusedMatchId]);

  useLayoutEffect(() => {
    if (!showCompetitionGate) return;
    clearPublicHash();
    forcePublicScrollTop();
  }, [league.id, showCompetitionGate]);

  useEffect(() => {
    const publicCompetitionIds = new Set(getPublicCompetitions(league).map((competition) => competition.id));
    const defaultCompetitionId = getPublicCompetitions(league)[0]?.id || getDefaultCompetitionId(league);
    const rememberedCompetitionId = loadLastCompetitionId(league);
    const hasSelectedCompetition = publicCompetitionIds.has(selectedCompetitionId);
    const nextCompetitionId = hasSelectedCompetition ? selectedCompetitionId : rememberedCompetitionId || defaultCompetitionId;
    if (nextCompetitionId && selectedCompetitionId !== nextCompetitionId) setSelectedCompetitionId(nextCompetitionId);
  }, [league, selectedCompetitionId]);

  useEffect(() => {
    if (!showCompetitionGate && getPublicCompetitions(league).some((competition) => competition.id === selectedCompetitionId)) {
      saveLastCompetitionId(league.id, selectedCompetitionId);
    }
  }, [league.id, league.competitions, selectedCompetitionId, showCompetitionGate]);

  useEffect(() => {
    const shouldShowGate = hasTournamentSelector(league) && !hasExplicitUrlCompetition(league);
    if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
    setShowCompetitionGate(shouldShowGate);
    if (shouldShowGate) {
      clearPublicHash();
      forcePublicScrollTop();
    }
  }, [league.id, league.competitions]);

  useEffect(() => {
    if (!showCompetitionGate || !window.location.hash) return;
    clearPublicHash();
    forcePublicScrollTop();
  }, [league.id, showCompetitionGate]);

  useEffect(() => {
    if (showCompetitionGate || window.location.hash) return;
    forcePublicScrollTop();
  }, [league.id, showCompetitionGate]);

  useEffect(() => {
    onEntryModeChange?.(showCompetitionGate);
    return () => onEntryModeChange?.(false);
  }, [onEntryModeChange, showCompetitionGate]);

  useEffect(() => {
    if (activeCompetition?.season) setSelectedSeason(activeCompetition.season);
  }, [activeCompetition?.season]);

  useEffect(() => {
    setSelectedRound(defaultRound);
  }, [defaultRound, selectedCompetitionId]);

  useEffect(() => {
    if (!rounds.length) {
      setSelectedRound("");
      return;
    }
    if (!rounds.includes(Number(selectedRound))) setSelectedRound(defaultRound);
  }, [defaultRound, rounds, selectedRound]);

  useEffect(() => {
    if (!activeLeague.teams.length) {
      setSelectedTeamId("");
      return;
    }
    if (!activeLeague.teams.some((team) => team.id === selectedTeamId)) setSelectedTeamId(activeLeague.teams[0].id);
  }, [activeLeague.teams, selectedTeamId]);

  if (showCompetitionGate) {
    return (
      <main className="page public-tournament-entry-page" style={{ "--competition-accent": competitionAccent }}>
        <TournamentEntryGate
          archivedCompetitions={archivedPublicCompetitions}
          league={league}
          competitions={publicCompetitions}
          selectedCompetitionId={selectedCompetitionId}
          onSelectCompetition={selectCompetition}
        />
      </main>
    );
  }

  const isPublicHomeView = activePublicView === "inicio";

  return (
    <main className={`page public-league-page public-view-${activePublicView} ${isPublicHomeView ? "public-home-mode" : "public-screen-mode"}`} style={{ "--competition-accent": competitionAccent }}>
      {showIntro && <PublicLoading league={league} onDone={() => setShowIntro(false)} />}
      {isPublicHomeView && (
        <section className="hero public-hero" id="inicio" style={{ "--hero-image": `url(${heroImage})` }}>
          <div className="hero-content">
            <span className="eyebrow">
              {league.city} | {league.season}
            </span>
            <h1>{league.name}</h1>
            <p className="hero-tagline">La evolucion digital de tu liga.</p>
            <p>{league.identity.publicIntro}</p>
            <div className="hero-actions">
              <a
                href="#calendario"
                className="primary"
                onClick={(event) => {
                  event.preventDefault();
                  selectPublicView("calendario");
                }}
              >
                Ver partidos
              </a>
              <a
                href="#tabla"
                className="secondary"
                onClick={(event) => {
                  event.preventDefault();
                  selectPublicView("tabla");
                }}
              >
                Tabla general
              </a>
            </div>
          </div>
          <HeroMatchPanel league={activeLeague} match={featuredMatch} standings={standings} />
        </section>
      )}

      <PublicQuickNav activeView={activePublicView} onSelectView={selectPublicView} />

      {league.status === "suspended" && (
        <section className="suspension-banner">
          <strong>Liga suspendida temporalmente</strong>
          <span>La informacion puede mostrarse limitada hasta que la liga sea reactivada por un administrador.</span>
        </section>
      )}

      {isPublicHomeView && identityTags.length > 0 && (
        <section className="identity-strip" aria-label="Identidad de liga">
          {identityTags.map((tag) => <span key={tag}>{tag}</span>)}
        </section>
      )}

      <section className="public-app-workspace" id="torneo-app">
        {activePublicView === "inicio" && (
          <div className="public-app-view public-home-view">
            <PublicHomeDashboard
              activeCompetition={activeCompetition}
              announcements={activeAnnouncements}
              heroImage={heroImage}
              league={publicContentLeague}
              latestResults={latestResults}
              media={scopedPublicMedia}
              nextMatches={nextMatches}
              standings={standings}
              currentRound={selectedRound}
              stats={stats}
              scorers={allScorers}
              onLogin={() => onNavigate?.("/acceso")}
              onGoHome={() => {
                if (onNavigate) onNavigate("/");
                else window.location.assign("/");
              }}
              onOpenSearch={() => setPublicSearchOpen(true)}
              onOpenTournament={() => setCompetitionSheetOpen(true)}
              onSelectView={selectPublicView}
            />
          </div>
        )}

        {activePublicView === "tabla" && (
          <section className="panel public-screen-panel standings-panel" id="tabla">
            <StandingsTable
              activePanel={activeStatsPanel}
              disciplineRows={discipline}
              onSelectPanel={setActiveStatsPanel}
              onSelectPlayer={selectPublicPlayer}
              rows={standings}
              rules={activeLeague.rules}
              scorers={allScorers}
              suspensionNotices={suspensionNotices}
              league={activeLeague}
              competition={activeCompetition}
              onBack={() => selectPublicView("inicio")}
              onShareDiscipline={() => shareYellowCardsCard({ league: disciplineLeague, competition: activeCompetition, rows: discipline })}
              onShareScorers={() => shareScorersCard({ league: activeLeague, competition: activeCompetition, scorers: allScorers })}
              onShareStandings={() => shareStandingsCard({ league, competition: activeCompetition, standings })}
              onShareSuspensions={() => shareSuspensionsCard({ league: activeLeague, competition: activeCompetition, notices: suspensionNotices })}
            />
          </section>
        )}

        {activePublicView === "calendario" && (
          <PublicMatchesScreen
            groups={matchDayGroups}
            focusedMatchId={focusedMatchId}
            league={activeLeague}
            matchCount={selectedRoundMatches.length}
            onBack={() => selectPublicView("inicio")}
            onLogin={() => onNavigate?.("/acceso")}
            onSearch={setMatchSearchQuery}
            onSelectSearchResult={selectRoundMatchSearchResult}
            onSelectMatch={selectPublicMatch}
            onSelectRound={(round) => {
              setSelectedRound(round);
              setMatchSearchQuery("");
              setFocusedMatchId("");
            }}
            onShare={() => shareRoundCard({ league: activeLeague, selectedRound, matches: selectedRoundMatches })}
            query={matchSearchQuery}
            restingTeams={restingTeams}
            rounds={rounds}
            searchResults={matchSearchResults}
            selectedRound={selectedRound}
            visibleMatchCount={selectedRoundMatches.length}
          />
        )}

        {activePublicView === "partido" && selectedPublicMatch && (
          <PublicMatchDetailScreen
            league={activeLeague}
            match={selectedPublicMatch}
            onBack={() => selectPublicView("calendario", { preserveRound: true })}
            onShare={() => sharePublicMatchActaCard({ league: activeLeague, match: selectedPublicMatch })}
          />
        )}

        {activePublicView === "partido" && !selectedPublicMatch && (
          <section className="panel public-screen-panel">
            <PublicScreenHeader eyebrow="Partido" title="Partido no seleccionado" onBack={() => selectPublicView("calendario", { preserveRound: true })} />
            <p className="empty empty-polished">Selecciona un partido con resultado desde la pantalla de Partidos.</p>
          </section>
        )}

        {activePublicView === "fotos" && (
          <PublicPhotoFeedScreen
            competition={activeCompetition}
            league={publicContentLeague}
            media={scopedPublicMedia}
            onBack={() => selectPublicView("inicio")}
          />
        )}

        {activePublicView === "patrocinadores" && (
          <PublicSponsorsScreen
            competition={activeCompetition}
            league={publicContentLeague}
            onBack={() => selectPublicView("mas")}
            sponsors={getActivePublicSponsors(publicContentLeague)}
          />
        )}

        {activePublicView === "equipos" && (
          <section className="panel public-screen-panel" id="equipos">
            <PublicScreenHeader
              eyebrow={activeTeamsPanel === "equipo" ? "Plantilla" : activeTeamsPanel === "jugador" ? "Jugador" : "Clubes"}
              title={activeTeamsPanel === "equipo" ? selectedTeam?.name || "Equipo" : activeTeamsPanel === "jugador" ? "Ficha publica" : "Equipos"}
              onBack={() => {
                if (activeTeamsPanel === "equipos") {
                  selectPublicView("inicio");
                  return;
                }
                if (activeTeamsPanel === "jugador" && selectedTeam) {
                  selectPublicView("equipos", { teamsPanel: "equipo" });
                  return;
                }
                selectPublicView("equipos", { teamsPanel: "equipos" });
              }}
            />
            {activeTeamsPanel === "equipos" && (
              <TeamDirectory
                league={league}
                activeLeague={activeLeague}
                standings={standings}
                onSelectTeam={selectPublicTeam}
              />
            )}
            {activeTeamsPanel === "equipo" && (
              <TeamRosterScreen
                league={league}
                activeLeague={activeLeague}
                standings={standings}
                stats={stats}
                team={selectedTeam}
                onBack={() => selectPublicView("equipos", { teamsPanel: "equipos" })}
                onSelectPlayer={selectPublicPlayer}
              />
            )}
            {activeTeamsPanel === "jugador" && (
              <section className="public-subscreen-stack" id="jugador">
                <PlayerPublicCard
                  league={activeLeague}
                  seasonLeague={league}
                  player={selectedPlayer}
                  stats={stats}
                  onSelectTeam={(teamId) => {
                    selectPublicTeam(teamId);
                  }}
                />
              </section>
            )}
          </section>
        )}

        {activePublicView === "mas" && (
          <PublicMoreHub
            activeCompetition={activeCompetition}
            announcements={activeAnnouncements}
            competitionLeague={activeLeague}
            disciplineRows={discipline}
            legalPath={legalPath}
            league={league}
            onBack={() => selectPublicView("inicio")}
            onNavigate={onNavigate}
            onSelectDiscipline={() => selectPublicView("tabla", { statsPanel: "disciplina" })}
            onSelectMatches={() => selectPublicView("calendario")}
            onSelectSponsors={() => selectPublicView("patrocinadores")}
            onSelectStandings={() => selectPublicView("tabla")}
            publicContentLeague={publicContentLeague}
            suspensionNotices={suspensionNotices}
          />
        )}
      </section>

      {isPublicHomeView && <PublicLegalFooter legalPath={legalPath} league={league} onNavigate={onNavigate} />}
      {isPublicSearchOpen && (
        <PublicSearchSheet
          leagueName={league.name}
          onClose={() => {
            setPublicSearchOpen(false);
            setPublicSearch("");
          }}
          onSearch={setPublicSearch}
          onSelectResult={handlePublicSearchResult}
          onShare={shareLeague}
          query={publicSearch}
          results={publicSearchResults}
        />
      )}
      {isCompetitionSheetOpen && (
        <CompetitionSheet
          activeCompetitionId={selectedCompetitionId}
          competitions={publicCompetitions}
          league={league}
          onClose={() => setCompetitionSheetOpen(false)}
          onSelectCompetition={selectCompetition}
        />
      )}
    </main>
  );
}

function PublicLegalFooter({ legalPath, league, onNavigate }) {
  function handleLegalClick(event, targetPath = legalPath) {
    if (!onNavigate) return;
    event.preventDefault();
    onNavigate(targetPath);
  }

  return (
    <footer className="public-legal-footer">
      <img className="public-legal-watermark" alt="" src={alpLogo} />
      <div className="public-legal-brand">
        <span className="public-legal-mark" aria-hidden="true">
          <img alt="" src={ligatecLogo} />
        </span>
        <div>
          <strong>LIGATEC</strong>
          <small>Plataforma deportiva oficial</small>
        </div>
      </div>
      <div className="public-legal-context">
        <span>{league.name}</span>
        <strong>Informacion publica de competencia</strong>
        <small>Resultados, estadisticas y calendarios sujetos a validacion de la liga.</small>
      </div>
      <nav className="public-legal-links" aria-label="Informacion legal de LIGATEC">
        <a href={`${legalPath}#privacidad`} onClick={(event) => handleLegalClick(event, `${legalPath}#privacidad`)}><LegalFooterIcon type="privacy" />Privacidad</a>
        <a href={`${legalPath}#terminos`} onClick={(event) => handleLegalClick(event, `${legalPath}#terminos`)}><LegalFooterIcon type="terms" />Terminos</a>
        <a href={`${legalPath}#copyright`} onClick={(event) => handleLegalClick(event, `${legalPath}#copyright`)}><LegalFooterIcon type="copyright" />Copyright</a>
        <a href={`${legalPath}#contacto`} onClick={(event) => handleLegalClick(event, `${legalPath}#contacto`)}><LegalFooterIcon type="mail" />Contacto legal</a>
      </nav>
      <div className="public-legal-note">
        <strong>Uso responsable</strong>
        <span>Datos, imagenes y derechos protegidos por LIGATEC.</span>
      </div>
      <div className="public-legal-bottom">
        <span>© {new Date().getFullYear()} LIGATEC</span>
        <span>Hecho para ligas, equipos y aficion.</span>
      </div>
    </footer>
  );
}

function PublicPhotoFeedScreen({ competition, league, media = [], onBack }) {
  const feedItems = getPublicPhotoFeedItems(media, league, competition);
  return (
    <section className="public-photo-feed-screen" id="fotos">
      <PublicScreenHeader eyebrow="Galería" title="Fotos de la liga" onBack={onBack} />
      <article className="photo-feed-hero">
        <LoadableImage alt="" src={feedItems[0]?.imageUrl || stadiumHero} loading="eager" />
        <div>
          <span>{competition?.name || "Torneo activo"}</span>
          <strong>{league.name}</strong>
          <small>{feedItems.length} foto(s) disponibles</small>
        </div>
      </article>
      <div className="photo-feed-list" aria-label="Feed de fotos">
        {feedItems.map((item) => (
          <article className="photo-feed-card" key={item.id}>
            <LoadableImage alt={item.title || "Foto de la liga"} src={item.imageUrl} />
            <div>
              <span>{item.typeLabel}</span>
              <strong>{item.title}</strong>
              {item.caption && <p>{item.caption}</p>}
              <small>{item.date ? formatDate(item.date) : competition?.season || league.season || "Temporada activa"}</small>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function getPublicPhotoFeedItems(media = [], league, competition) {
  const labels = {
    hero: "Portada",
    moment: "Momento destacado",
    gallery: "Galería",
    sponsor: "Patrocinador"
  };
  const photos = media
    .filter((item) => item.status !== "archived" && item.imageUrl)
    .sort((a, b) => (
      Number(a.sortOrder || 0) - Number(b.sortOrder || 0) ||
      String(b.date || "").localeCompare(String(a.date || ""))
    ))
    .map((item, index) => ({
      ...item,
      id: item.id || `photo-${index}`,
      title: item.title || (index === 0 ? league.name : "Momento de la liga"),
      caption: item.caption || "",
      typeLabel: labels[item.type] || "Foto"
    }));

  if (photos.length) return photos;
  return [
    {
      id: "photo-feed-fallback",
      imageUrl: stadiumHero,
      title: competition?.name || league.name,
      caption: "La galería del torneo aparecerá aquí cuando subas fotos desde el panel admin.",
      typeLabel: "Galería",
      date: competition?.season || league.season || ""
    }
  ];
}

function PublicSponsorsScreen({ competition, league, onBack, sponsors = [] }) {
  const featuredCount = sponsors.filter((sponsor) => sponsor.featured || sponsor.placement === "home_featured").length;

  function renderSponsorCard(sponsor, index) {
    const isFeatured = sponsor.featured || sponsor.placement === "home_featured" || index === 0;
    const content = (
      <>
        <div className="sponsor-screen-image">
          <LoadableImage alt={sponsor.name} src={sponsor.imageUrl} />
        </div>
        <div className="sponsor-screen-info">
          <small>{isFeatured ? "Patrocinador destacado" : "Aliado oficial"}</small>
          <strong>{sponsor.name}</strong>
          {sponsor.description && <p>{sponsor.description}</p>}
        </div>
      </>
    );

    return sponsor.linkUrl ? (
      <a className={`sponsor-screen-card${isFeatured ? " is-featured" : ""}`} href={sponsor.linkUrl} key={sponsor.id} rel="noreferrer" target="_blank">
        {content}
      </a>
    ) : (
      <article className={`sponsor-screen-card${isFeatured ? " is-featured" : ""}`} key={sponsor.id}>
        {content}
      </article>
    );
  }

  return (
    <section className="public-sponsors-screen" id="patrocinadores">
      <PublicScreenHeader eyebrow="Aliados" title="Patrocinadores" onBack={onBack} />
      <article className="sponsors-screen-hero">
        <div>
          <span>{competition?.name || "Torneo activo"}</span>
          <strong>Marcas oficiales</strong>
          <small>{league.name}</small>
        </div>
        <div className="sponsors-screen-count">
          <strong>{sponsors.length}</strong>
          <small>aliados</small>
          <em>{featuredCount} destacado(s)</em>
        </div>
      </article>
      {sponsors.length ? (
        <div className="sponsors-screen-list" aria-label="Todos los patrocinadores">
          {sponsors.map(renderSponsorCard)}
        </div>
      ) : (
        <div className="sponsors-screen-empty">
          <strong>Espacio comercial disponible</strong>
          <small>Los patrocinadores de este torneo aparecerán aquí cuando se configuren desde el panel admin.</small>
        </div>
      )}
      <SponsorContactCard league={league} />
    </section>
  );
}

function PublicMoreHub({
  activeCompetition,
  announcements,
  competitionLeague,
  disciplineRows,
  legalPath,
  league,
  onBack,
  onNavigate,
  onSelectDiscipline,
  onSelectMatches,
  onSelectSponsors,
  onSelectStandings,
  publicContentLeague,
  suspensionNotices
}) {
  const rules = competitionLeague.rules || {};
  const playedMatches = competitionLeague.matches.filter((match) => match.status === "finished" || match.status === "walkover").length;
  const scheduledMatches = competitionLeague.matches.filter(isPublicScheduledMatch).length;
  const activeSponsors = (publicContentLeague.sponsors || []).filter((sponsor) => (sponsor.status || "active") === "active");
  const qualifierCount = Number(rules.playoffQualifiers || 0);
  const yellowLimit = Number(rules.yellowSuspensionLimit || 3);
  const latestAnnouncements = announcements.length
    ? announcements.slice(0, 2)
    : [{
      id: "demo-public-announcement",
      title: "Comunicado de jornada",
      date: new Date().toISOString().slice(0, 10),
      body: "La liga informa que los horarios y canchas de la siguiente jornada se mantendrán sujetos a validación oficial. Revisa Partidos antes de asistir."
    }];
  const moreRuleItems = [
    { label: "Default", value: `${rules.forfeitGoalsFor ?? 3}-${rules.forfeitGoalsAgainst ?? 0} · ${rules.forfeitPoints ?? 3} pts` },
    { label: "Amarillas", value: `${yellowLimit} = suspensión` },
    { label: "Rojas", value: `${rules.defaultRedSuspensionMatches ?? 1} partido base` },
    { label: "Disciplina", value: (rules.disciplineScope || "competition") === "league" ? "Toda la liga" : "Por torneo" }
  ];

  function handleLegalClick(event, targetPath = legalPath) {
    if (!onNavigate) return;
    event.preventDefault();
    onNavigate(targetPath);
  }

  function scrollToMoreSection(sectionId) {
    const section = document.getElementById(sectionId);
    section?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <section className="public-more-hub" id="mas">
      <PublicScreenHeader eyebrow="Centro de liga" title="Más" onBack={onBack} />

      <article className="more-hero-card">
        <div>
          <span>{activeCompetition?.name || "Torneo activo"}</span>
          <strong>{league.name}</strong>
          <small>{getSeasonValue(activeCompetition, league)}</small>
        </div>
        <span className="more-hero-logo" aria-hidden="true">
          {getTeamInitials(activeCompetition?.name || league.name)}
        </span>
        <div className="more-hero-metrics">
          <span><strong>{competitionLeague.teams.length}</strong><small>Equipos</small></span>
          <span><strong>{playedMatches}</strong><small>Jugados</small></span>
          <span><strong>{scheduledMatches}</strong><small>Por jugar</small></span>
        </div>
      </article>

      <nav className="more-category-rail" aria-label="Secciones de Más">
        <button className="active" type="button" onClick={() => scrollToMoreSection("mas-reglamento")}>
          <MoreHubIcon type="rules" />
          <span>Reglamento</span>
        </button>
        <button type="button" onClick={() => scrollToMoreSection("mas-disciplina")}>
          <MoreHubIcon type="discipline" />
          <span>Disciplina</span>
        </button>
        <button type="button" onClick={() => scrollToMoreSection("mas-comunicados")}>
          <MoreHubIcon type="announcements" />
          <span>Comunicados</span>
        </button>
        <button type="button" onClick={() => scrollToMoreSection("mas-patrocinadores")}>
          <MoreHubIcon type="sponsors" />
          <span>Patrocinadores</span>
        </button>
        <button type="button" onClick={() => scrollToMoreSection("mas-legal")}>
          <MoreHubIcon type="legal" />
          <span>Legal</span>
        </button>
      </nav>

      <div className="more-hub-grid">
        <article className="more-hub-card is-rules" id="mas-reglamento">
          <MoreHubIcon type="rules" />
          <div>
            <span>Reglamento y torneo</span>
            <strong>Reglas principales</strong>
            <p>Reglamento público configurado para este torneo, mostrando solo reglas activas y legibles.</p>
          </div>
          <div className="more-chip-row">
            <small>{qualifierCount || "Sin"} clasifican</small>
            <small>{yellowLimit} amarillas</small>
          </div>
          <div className="more-rule-list">
            {moreRuleItems.map((item) => (
              <span key={item.label}>
                <small>{item.label}</small>
                <strong>{item.value}</strong>
              </span>
            ))}
          </div>
          <button type="button" onClick={onSelectStandings}>Ver tabla</button>
        </article>

        <article className="more-hub-card is-discipline" id="mas-disciplina">
          <MoreHubIcon type="discipline" />
          <div>
            <span>Disciplina</span>
            <strong>Tarjetas y sanciones</strong>
            <p>Consulta trazabilidad de amarillas, expulsiones activas y jornadas de regreso.</p>
          </div>
          <div className="more-chip-row">
            <small>{disciplineRows.length} en seguimiento</small>
            <small>{suspensionNotices.length} suspendidos</small>
          </div>
          <button type="button" onClick={onSelectDiscipline}>Abrir disciplina</button>
        </article>

        <article className="more-hub-card is-news" id="mas-comunicados">
          <MoreHubIcon type="announcements" />
          <div>
            <span>Comunicados</span>
            <strong>Avisos oficiales</strong>
            <p>Cambios de cancha, acuerdos, reprogramaciones y mensajes importantes de la liga.</p>
          </div>
          <div className="more-announcement-list">
            {latestAnnouncements.map((announcement) => (
              <span key={announcement.id || announcement.title}>
                <b>{announcement.title || "Aviso de la liga"}</b>
                <small>{announcement.date ? formatDate(announcement.date) : "Publicado"}</small>
                {announcement.body && <em>{announcement.body}</em>}
              </span>
            ))}
          </div>
          <button type="button" onClick={onSelectMatches}>Ver partidos</button>
        </article>

        <article className="more-hub-card more-sponsor-card is-sponsors" id="mas-patrocinadores">
          <MoreHubIcon type="sponsors" />
          <div>
            <span>Patrocinadores</span>
            <strong>Aliados del torneo</strong>
            <p>Marcas oficiales y contacto comercial para anunciarse en esta competencia.</p>
          </div>
          <div className="more-chip-row">
            <small>{activeSponsors.length} marca(s)</small>
            <small>Destacados</small>
          </div>
          <MoreSponsorDisplay
            fallback={league.adBanner || "Espacio comercial disponible"}
            onViewAll={onSelectSponsors}
            sponsors={getActivePublicSponsors(publicContentLeague)}
          />
          <SponsorContactCard league={league} />
        </article>

        <article className="more-hub-card is-legal" id="mas-legal">
          <MoreHubIcon type="legal" />
          <div>
            <span>Legal y contacto</span>
            <strong>Información LIGATEC</strong>
            <p>Privacidad, términos, derechos de imagen, contacto legal y acceso privado.</p>
          </div>
          <nav className="more-legal-links" aria-label="Legal y contacto">
            <a href={`${legalPath}#privacidad`} onClick={(event) => handleLegalClick(event, `${legalPath}#privacidad`)}>Privacidad</a>
            <a href={`${legalPath}#terminos`} onClick={(event) => handleLegalClick(event, `${legalPath}#terminos`)}>Términos</a>
            <a href={`${legalPath}#copyright`} onClick={(event) => handleLegalClick(event, `${legalPath}#copyright`)}>Copyright</a>
            <a href={`${legalPath}#contacto`} onClick={(event) => handleLegalClick(event, `${legalPath}#contacto`)}>Contacto</a>
          </nav>
        </article>
      </div>
    </section>
  );
}

function buildPublicRuleItems(rules = {}) {
  const withdrawalPolicy = rules.withdrawalPolicy === "manual"
    ? "Resolución manual por administración"
    : `Rival gana por default ${rules.forfeitGoalsFor ?? 3}-${rules.forfeitGoalsAgainst ?? 0}`;
  const disciplineScope = (rules.disciplineScope || "competition") === "league"
    ? "Disciplina acumulada en toda la liga"
    : "Disciplina separada por torneo";
  const playoffQualifiers = Number(rules.playoffQualifiers ?? 8);
  const minimumPlayoffAppearances = Number(rules.minimumPlayoffAppearances ?? 0);
  const items = [
    { label: "Default", value: `${withdrawalPolicy} · ${rules.forfeitPoints ?? 3} pts` },
    { label: "Amarillas", value: `${rules.yellowSuspensionLimit ?? 3} tarjetas = suspensión` },
    { label: "Rojas", value: `${rules.defaultRedSuspensionMatches ?? 1} partido(s) base` },
    { label: "Disciplina", value: disciplineScope },
    { label: "Liguilla", value: playoffQualifiers > 0 ? `${playoffQualifiers} clasificado(s)` : "Sin liguilla configurada" },
    { label: "Elegibilidad", value: minimumPlayoffAppearances > 0 ? `${minimumPlayoffAppearances} PJ mínimo` : "Sin mínimo de partidos" }
  ];
  if (rules.notes) items.push({ label: "Notas", value: rules.notes });
  return items;
}

function MoreSponsorDisplay({ sponsors, fallback, onViewAll }) {
  if (!sponsors.length) {
    return (
      <div className="more-sponsor-empty">
        <strong>{fallback || "Espacio disponible para tu marca"}</strong>
        <small>Tu negocio puede aparecer en esta sección del torneo.</small>
      </div>
    );
  }

  const highlighted = sponsors.filter((sponsor) => sponsor.featured || sponsor.placement === "home_featured").slice(0, 3);
  const visibleSponsors = highlighted.length ? highlighted : sponsors.slice(0, Math.min(2, sponsors.length));
  const [featured, ...rest] = visibleSponsors;
  const renderSponsor = (sponsor, className) => {
    const content = (
      <>
        <LoadableImage alt={sponsor.name} src={sponsor.imageUrl} />
        <span>
          <small>{className.includes("featured") ? "Patrocinador destacado" : "Aliado oficial"}</small>
          <strong>{sponsor.name}</strong>
        </span>
      </>
    );
    return sponsor.linkUrl ? (
      <a className={className} href={sponsor.linkUrl} key={sponsor.id} rel="noreferrer" target="_blank">{content}</a>
    ) : (
      <article className={className} key={sponsor.id}>{content}</article>
    );
  };

  return (
    <div className="more-sponsor-display">
      {renderSponsor(featured, "more-sponsor-featured")}
      {!!rest.length && (
        <div className="more-sponsor-row" aria-label="Patrocinadores destacados">
          {rest.map((sponsor) => renderSponsor(sponsor, "more-sponsor-mini"))}
        </div>
      )}
      <button className="more-sponsor-view-all" type="button" onClick={onViewAll}>Ver todos</button>
    </div>
  );
}

function MoreHubIcon({ type }) {
  if (type === "rules") {
    return (
      <span className="more-hub-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M7 4h10a2 2 0 0 1 2 2v14l-4-2-4 2-4-2-4 2V6a2 2 0 0 1 2-2h2Z" /><path d="M8 9h8" /><path d="M8 13h6" /></svg>
      </span>
    );
  }
  if (type === "discipline") {
    return (
      <span className="more-hub-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M9 4h6l2 16H7Z" /><path d="M8 8h8" /></svg>
      </span>
    );
  }
  if (type === "announcements") {
    return (
      <span className="more-hub-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M4 13V9l11-4v12Z" /><path d="M4 13l2 6h4l-2-6" /><path d="M18 10h3" /></svg>
      </span>
    );
  }
  if (type === "sponsors") {
    return (
      <span className="more-hub-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M12 3l2.7 5.5 6.1.9-4.4 4.3 1 6-5.4-2.9-5.4 2.9 1-6-4.4-4.3 6.1-.9Z" /></svg>
      </span>
    );
  }
  return (
    <span className="more-hub-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24"><path d="M12 3 5 6v6c0 4.3 2.8 7.4 7 9 4.2-1.6 7-4.7 7-9V6Z" /><path d="m9 12 2 2 4-5" /></svg>
    </span>
  );
}

function PublicSearchSheet({ leagueName, onClose, onSearch, onSelectResult, onShare, query, results }) {
  const searchInputRef = useRef(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      searchInputRef.current?.focus({ preventScroll: true });
    }, 80);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="public-search-sheet-backdrop" role="presentation" onClick={onClose}>
      <section
        aria-label="Buscar equipo o jugador"
        aria-modal="true"
        className="public-search-sheet"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="public-search-sheet-head">
          <div>
            <span>Busqueda publica</span>
            <strong>Encuentra equipos, jugadores o partidos</strong>
          </div>
          <button type="button" aria-label="Cerrar busqueda" onClick={onClose}>X</button>
        </div>
        <PublicUtilityBar
          leagueName={leagueName}
          onSearch={onSearch}
          onSelectResult={onSelectResult}
          onShare={onShare}
          query={query}
          results={results}
          searchInputRef={searchInputRef}
        />
      </section>
    </div>
  );
}

function PublicScreenHeader({ eyebrow, title, onBack }) {
  return (
    <header className="public-screen-header">
      <button className="public-screen-back" type="button" onClick={onBack} aria-label="Regresar">
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="m15 5-7 7 7 7" />
        </svg>
      </button>
      <div>
        <span>{eyebrow}</span>
        <strong>{title}</strong>
      </div>
    </header>
  );
}

function PublicLeagueShowcaseHeader({ actionLabel = "Login", onAction, onBack, variant = "login" }) {
  return (
    <div className="standings-showcase-topbar public-showcase-topbar">
      <button className="standings-back-button public-showcase-back-button" type="button" onClick={onBack} aria-label="Volver al inicio">
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="m15 5-7 7 7 7" />
        </svg>
      </button>
      <div className="standings-showcase-brand public-showcase-brand" aria-label="LIGATEC">
        <img alt="LIGATEC" src={ligatecLogo} />
        <div>
          <strong>LIGA<span>TEC</span></strong>
          <small>PLATAFORMA DEPORTIVA</small>
        </div>
      </div>
      <button className={`public-showcase-action is-${variant}`} type="button" onClick={onAction}>
        {variant === "login" ? <span className="access-link-mark" aria-hidden="true" /> : <ShareGlyph />}
        <strong>{actionLabel}</strong>
      </button>
    </div>
  );
}

function PublicMatchesScreen({
  focusedMatchId,
  groups,
  league,
  matchCount,
  onBack,
  onLogin,
  onSearch,
  onSelectSearchResult,
  onSelectMatch,
  onSelectRound,
  onShare,
  query,
  restingTeams,
  rounds,
  searchResults,
  selectedRound,
  visibleMatchCount
}) {
  const [statusFilter, setStatusFilter] = useState("todos");
  const dateRange = getPublicRoundDateRange(groups);
  const normalizedQuery = normalizeSearchTerm(query);
  const showSearchResults = normalizedQuery.length >= 2;
  const roundMatches = useMemo(() => groups.flatMap((group) => group.matches), [groups]);
  const statusOptions = useMemo(() => ([
    { id: "todos", label: "Todos", count: roundMatches.length },
    { id: "programados", label: "Programados", count: roundMatches.filter((match) => getPublicMatchStatusGroup(match) === "programados").length },
    { id: "finalizados", label: "Finalizados", count: roundMatches.filter((match) => getPublicMatchStatusGroup(match) === "finalizados").length }
  ]), [roundMatches]);
  const filteredMatches = useMemo(() => (
    statusFilter === "todos"
      ? roundMatches
      : roundMatches.filter((match) => getPublicMatchStatusGroup(match) === statusFilter)
  ), [roundMatches, statusFilter]);
  const displayGroups = useMemo(() => {
    return groups
      .map((group) => ({
        ...group,
        matches: group.matches.filter((match) => filteredMatches.some((item) => item.id === match.id))
      }))
      .filter((group) => group.matches.length);
  }, [filteredMatches, groups]);
  const visibleFilteredCount = displayGroups.reduce((total, group) => total + group.matches.length, 0);

  return (
    <section className="public-matches-screen" id="calendario">
      <PublicLeagueShowcaseHeader
        actionLabel="Login"
        onAction={onLogin}
        onBack={onBack}
        variant="login"
      />
      <div className="public-matches-top">
        <div className="matches-title-block">
          <strong>Jornada {selectedRound || "-"}</strong>
          <div className="public-matches-meta">
            <span><MatchMetaIcon type="calendar" />{dateRange}</span>
            <span><MatchMetaIcon type="ball" />{matchCount} partido(s)</span>
          </div>
        </div>
        <div className="matches-actions-panel">
          <ShareActionButton className="matches-share-button" label="Compartir" onClick={onShare} />
        </div>
      </div>

      <PublicRoundScroller rounds={rounds} selectedRound={selectedRound} onSelectRound={onSelectRound} />

      <div className="public-match-control-panel">
        <div className="public-match-status-tabs" aria-label="Filtrar partidos por estado">
          {statusOptions.map((option) => (
            <button
              className={statusFilter === option.id ? "active" : ""}
              key={option.id}
              type="button"
              onClick={() => setStatusFilter(option.id)}
            >
              <span aria-hidden="true" />
              {option.label}
              <small>{option.count}</small>
            </button>
          ))}
          <button className="public-match-filter-icon" type="button" aria-label="Filtros de partidos">
            <MatchMetaIcon type="filter" />
          </button>
        </div>

        <div className="public-match-tools-row">
          <div className="match-search-box">
            <label className={`match-inline-search ${query ? "has-value" : ""}`}>
              <span aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(event) => onSearch(event.target.value)}
                placeholder="Buscar equipo..."
                aria-controls="match-search-results"
                aria-expanded={showSearchResults}
              />
              {query && (
                <button
                  className="search-clear-button"
                  type="button"
                  aria-label="Limpiar busqueda"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onSearch("")}
                >
                  X
                </button>
              )}
            </label>
            <div className={`match-search-results ${showSearchResults ? "is-open" : ""}`} id="match-search-results">
              {showSearchResults && searchResults.length > 0 && (
                searchResults.map((result) => (
                  <button key={result.id} type="button" onClick={() => onSelectSearchResult(result.id)}>
                    <span>{result.label}</span>
                    <strong>{result.title}</strong>
                    <small>{result.detail}</small>
                  </button>
                ))
              )}
              {showSearchResults && !searchResults.length && (
                <p>No hay partidos de esta jornada con esa busqueda.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="public-match-day-list">
        {displayGroups.map((group) => (
          <section className="public-match-day" key={group.id}>
            <header>
              <span className="match-day-icon" aria-hidden="true"><MatchMetaIcon type="calendar" /></span>
              <div>
                <strong>{group.title}</strong>
                <small>{group.subtitle}</small>
              </div>
              <em>{group.matches.length} partido{group.matches.length === 1 ? "" : "s"}</em>
            </header>
            <div className="public-match-card-list">
              {group.matches.map((match) => (
                <PublicScheduleMatchCard
                  key={match.id}
                  focused={focusedMatchId === match.id}
                  league={league}
                  match={match}
                  onSelectMatch={onSelectMatch}
                />
              ))}
            </div>
          </section>
        ))}
        {Boolean(visibleMatchCount) && !visibleFilteredCount && (
          <p className="empty empty-polished">No hay partidos con los filtros seleccionados.</p>
        )}
        {!visibleMatchCount && <p className="empty empty-polished">No hay partidos en esta jornada.</p>}
        <RestingTeams teams={restingTeams} />
      </div>
    </section>
  );
}

function PublicRoundScroller({ rounds, selectedRound, onSelectRound }) {
  const selectedButtonRef = useRef(null);

  useEffect(() => {
    selectedButtonRef.current?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [selectedRound]);

  return (
    <div className="public-round-scroller" aria-label="Seleccionar jornada">
      {rounds.map((round) => (
        <button
          className={Number(round) === Number(selectedRound) ? "active" : ""}
          key={round}
          ref={Number(round) === Number(selectedRound) ? selectedButtonRef : null}
          type="button"
          onClick={() => onSelectRound(round)}
        >
          J{round}
        </button>
      ))}
    </div>
  );
}

function PublicScheduleMatchCard({ focused = false, league, match, onSelectMatch }) {
  const homeTeam = getTeam(league, match.homeTeamId);
  const awayTeam = getTeam(league, match.awayTeamId);
  const statusLabel = getMatchStatusLabel(match);
  const isFinished = match.status === "finished" || match.status === "walkover";
  const canOpenDetail = isFinished && (match.events || []).length > 0;
  const statusGroup = getPublicMatchStatusGroup(match);
  const tone = getPublicMatchTone(match);
  const matchContent = (
    <>
      <span className="schedule-match-time">
        <strong>{match.time || "--:--"}</strong>
        <small>HRS</small>
      </span>
      <div className="schedule-match-info">
        <span className="schedule-match-venue"><MatchMetaIcon type="venue" />{match.venue || "Cancha por definir"}</span>
      </div>
      <div className="schedule-match-versus">
        <div className="schedule-match-team home">
          <TeamMark team={homeTeam} className="schedule-match-crest" />
          <strong>{homeTeam?.name || "LOCAL"}</strong>
        </div>
        <div className="schedule-match-center">
          <strong>{isFinished ? `${match.homeGoals ?? 0}-${match.awayGoals ?? 0}` : "VS"}</strong>
        </div>
        <div className="schedule-match-team away">
          <strong>{awayTeam?.name || "VISITANTE"}</strong>
          <TeamMark team={awayTeam} className="schedule-match-crest" />
        </div>
      </div>
      <span className={`schedule-status ${statusGroup}`}>{statusLabel}</span>
    </>
  );

  if (!canOpenDetail) {
    return (
      <article className={`public-schedule-match is-static ${focused ? "is-search-focused" : ""} ${tone}`} data-public-match-id={match.id}>
        <div className="schedule-match-layout">
          {matchContent}
        </div>
      </article>
    );
  }

  return (
    <button
      className={`public-schedule-match is-played ${focused ? "is-search-focused" : ""} ${tone}`}
      data-public-match-id={match.id}
      type="button"
      onClick={() => onSelectMatch?.(match.id)}
    >
      <span className="schedule-match-layout">
        {matchContent}
        <b aria-hidden="true">›</b>
      </span>
    </button>
  );
}

function PublicMatchDetailScreen({ league, match, onBack, onShare }) {
  const homeTeam = getTeam(league, match.homeTeamId);
  const awayTeam = getTeam(league, match.awayTeamId);
  const competition = getCompetition(league, match.competitionId);
  const statusLabel = getMatchStatusLabel(match);
  const events = sortMatchEvents(match.events || []);
  const dateCopy = match.date ? formatDate(match.date) : "Fecha por definir";
  const hasNotes = Boolean(match.observations || match.resolutionNote);

  return (
    <section className="public-match-detail-screen" id="partido">
      <header className="public-match-detail-topbar">
        <button className="public-match-detail-back" type="button" onClick={onBack} aria-label="Regresar a partidos">
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="m15 5-7 7 7 7" />
          </svg>
        </button>
        <strong>Detalle del partido</strong>
        <ShareActionButton className="public-match-detail-share" label="Compartir" onClick={onShare} />
      </header>
      <div className="public-match-detail-hero">
        <div className="public-match-detail-meta">
          <span>{competition?.name || league.name}</span>
          <strong>Jornada {match.round || "-"}</strong>
          <div>
            <small><MatchMetaIcon type="calendar" />{dateCopy}</small>
            <small><MatchMetaIcon type="time" />{match.time || "Hora por definir"}</small>
            <small><MatchMetaIcon type="venue" />{match.venue || "Cancha por definir"}</small>
          </div>
        </div>
        <div className="public-match-detail-scoreboard">
          <div className="public-match-detail-team">
            <TeamMark team={homeTeam} className="public-match-detail-crest" />
            <strong>{homeTeam?.name || "LOCAL"}</strong>
          </div>
          <div className="public-match-detail-score">
            <span>{statusLabel}</span>
            <strong>{match.homeGoals ?? 0}-{match.awayGoals ?? 0}</strong>
          </div>
          <div className="public-match-detail-team away">
            <TeamMark team={awayTeam} className="public-match-detail-crest" />
            <strong>{awayTeam?.name || "VISITANTE"}</strong>
          </div>
        </div>
      </div>
      <section className="public-match-events-section">
        <div className="public-match-events-title">
          <div>
            <span>Acta publica</span>
            <strong>Eventos del partido</strong>
          </div>
          <small>{events.length} registros</small>
        </div>
        <MatchEventSummary league={league} match={match} homeTeam={homeTeam} awayTeam={awayTeam} />
      </section>
      {hasNotes && (
        <section className="public-match-notes-card">
          <span>Notas del acta</span>
          {match.observations && <p><strong>Observaciones</strong>{match.observations}</p>}
          {match.resolutionNote && <p><strong>Resolucion</strong>{match.resolutionNote}</p>}
        </section>
      )}
    </section>
  );
}

function PublicTeamsTabs({ activePanel, onSelectPanel }) {
  const tabs = [
    { id: "equipos", label: "Equipos" },
    { id: "jugador", label: "Ficha publica" }
  ];

  return (
    <nav className="public-teams-tabs" aria-label="Secciones de equipos">
      {tabs.map((tab) => (
        <button
          aria-current={activePanel === tab.id ? "page" : undefined}
          className={activePanel === tab.id ? "active" : ""}
          key={tab.id}
          type="button"
          onClick={() => onSelectPanel(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}

function isSetupHighlight(item) {
  return /liga creada.*agrega equipos.*jugadores.*calendario/i.test(String(item || ""));
}

function PublicLoading({ league, onDone }) {
  return (
    <div className="public-loading" role="status" aria-label="Cargando liga" onAnimationEnd={onDone}>
      <div>
        <span>{getTeamInitials(league.name)}</span>
        <strong>{league.name}</strong>
        <small>{league.season}</small>
      </div>
    </div>
  );
}

function getCompetitionOverview(league, competitionId) {
  const scoped = scopeLeagueToCompetition(league, competitionId);
  const competition = getCompetition(league, competitionId);
  return {
    competition,
    teamCount: scoped.teams.length,
    playerCount: scoped.players.length,
    matchCount: scoped.matches.length,
    scheduledCount: scoped.matches.filter(isPublicScheduledMatch).length,
    round: competition?.activeRound || getCurrentDisplayRound(scoped.matches) || "-"
  };
}

function CompetitionMark({ accent, label = "LT" }) {
  return (
    <span className="competition-mark" style={{ "--mark-accent": accent }} aria-hidden="true">
      {String(label || "LT").slice(0, 2).toLocaleUpperCase("es-MX")}
    </span>
  );
}

function getCompetitionEntryStatus(competition, isSelected) {
  if (competition.status === "archived") return "Historico";
  if (competition.status === "pending" || competition.status === "coming_soon") return "Proximamente";
  return isSelected ? "Publicado activo" : "Publicado";
}

function getCompetitionEntryDescription(league, competition) {
  if (competition.description) return competition.description;
  if (/copa/i.test(competition.name)) return "Torneo de eliminacion directa donde todos buscan la gloria.";
  if (/fut\s*7|f7/i.test(competition.name)) return "Futbol 7 con calendario, tabla y estadisticas actualizadas.";
  if (/segunda/i.test(competition.name)) return "Competencia de alto nivel para equipos en desarrollo.";
  return `Categoria principal de ${league.name} con calendario, tabla y estadisticas.`;
}

function TournamentEntryGate({ archivedCompetitions = [], league, competitions, selectedCompetitionId, onSelectCompetition }) {
  const locationTitle = league.city || "Liga";
  const locationSubtitle = league.state || "Michoacan, Mexico";
  const accentSource = [...competitions, ...archivedCompetitions];

  useLayoutEffect(() => {
    forcePublicScrollTop();
  }, [league.id]);

  return (
    <section className="tournament-entry-gate" aria-label="Seleccionar torneo">
      <div className="tournament-entry-brand">
        <div className="tournament-entry-logo">
          <img alt="LIGATEC" src={ligatecLogo} />
          <strong>LIGA<span>TEC</span></strong>
        </div>
        <span className="tournament-entry-location">
          <b aria-hidden="true" />
          <strong>{locationTitle}</strong>
          <small>{locationSubtitle}</small>
        </span>
      </div>
      <div className="tournament-entry-copy">
        <span>Primer ingreso</span>
        <h1>Bienvenido a <strong>{league.name}</strong></h1>
        <p>Selecciona el torneo activo que deseas consultar.</p>
      </div>
      <div className="tournament-entry-section-title">
        <span />
        <strong>Torneos activos</strong>
      </div>
      <div className="tournament-entry-list">
        {!competitions.length && (
          <p className="tournament-entry-empty">No hay torneos publicados en este momento. Puedes consultar el historial archivado.</p>
        )}
        {competitions.map((competition) => {
          const overview = getCompetitionOverview(league, competition.id);
          const accent = getCompetitionAccent(accentSource, competition.id);
          const isSelected = competition.id === selectedCompetitionId;
          return (
            <button
              className={isSelected ? "active" : ""}
              key={competition.id}
              style={{ "--entry-accent": accent }}
              type="button"
              onClick={() => onSelectCompetition(competition.id)}
            >
              <CompetitionMark accent={accent} label={competition.name} />
              <span className="tournament-entry-info">
                <small className="tournament-entry-status">
                  <i aria-hidden="true" />
                  {getCompetitionEntryStatus(competition, isSelected)}
                </small>
                <strong>{competition.name}</strong>
                <small className="tournament-entry-season">{competition.season || league.season}</small>
                <small className="tournament-entry-description">{getCompetitionEntryDescription(league, competition)}</small>
              </span>
              <em>
                <strong>{overview.teamCount}</strong>
                <span>Equipos</span>
              </em>
              <b className="tournament-entry-chevron" aria-hidden="true">›</b>
            </button>
          );
        })}
      </div>
      {!!archivedCompetitions.length && (
        <details className="tournament-entry-history">
          <summary>
            <span>Historial de torneos</span>
            <strong>{archivedCompetitions.length}</strong>
          </summary>
          <div className="tournament-entry-history-list">
            {archivedCompetitions.map((competition) => {
              const overview = getCompetitionOverview(league, competition.id);
              const accent = getCompetitionAccent(accentSource, competition.id);
              const isSelected = competition.id === selectedCompetitionId;
              return (
                <button
                  className={isSelected ? "active" : ""}
                  key={competition.id}
                  style={{ "--entry-accent": accent }}
                  type="button"
                  onClick={() => onSelectCompetition(competition.id)}
                >
                  <CompetitionMark accent={accent} label={competition.name} />
                  <span>
                    <small>{competition.season || league.season}</small>
                    <strong>{competition.name}</strong>
                  </span>
                  <em>{overview.teamCount} equipos</em>
                  <b aria-hidden="true">›</b>
                </button>
              );
            })}
          </div>
        </details>
      )}
      <div className="tournament-entry-note">
        <b aria-hidden="true">i</b>
        <span>
          <strong>Los torneos archivados quedan como historico</strong>
          <small>El admin decide que torneos aparecen publicados en esta portada.</small>
        </span>
      </div>
      <footer className="tournament-entry-footer">
        <span>Desarrollado por:</span>
        <img alt="ALP DEV" src={alpLogo} />
      </footer>
    </section>
  );
}

function PublicCompetitionDock({ activeCompetition, competitions, league, onOpen, visible }) {
  if (!visible || !activeCompetition) return null;
  const overview = getCompetitionOverview(league, activeCompetition.id);
  const accent = getCompetitionAccent(competitions, activeCompetition.id);

  return (
    <section className="public-competition-dock" aria-label="Torneo actual">
      <div>
        <CompetitionMark accent={accent} label={activeCompetition.name} />
        <span>
          <small>{activeCompetition.season || "Temporada"}</small>
          <strong>{activeCompetition.name}</strong>
        </span>
      </div>
      <button type="button" onClick={onOpen}>Cambiar torneo</button>
      <dl>
        <div>
          <dt>Jornada</dt>
          <dd>{overview.round}</dd>
        </div>
        <div>
          <dt>Equipos</dt>
          <dd>{overview.teamCount}</dd>
        </div>
        <div>
          <dt>Por jugar</dt>
          <dd>{overview.scheduledCount}</dd>
        </div>
      </dl>
    </section>
  );
}

function CompetitionSheet({ activeCompetitionId, competitions, league, onClose, onSelectCompetition }) {
  return (
    <div className="competition-sheet-backdrop" role="presentation" onClick={onClose}>
      <section
        aria-label="Cambiar torneo"
        aria-modal="true"
        className="competition-sheet"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="competition-sheet-head">
          <div>
            <span>Cambiar torneo</span>
            <strong>{league.name}</strong>
          </div>
          <button type="button" aria-label="Cerrar selector de torneo" onClick={onClose}>×</button>
        </div>
        <div className="competition-sheet-list">
          {competitions.map((competition) => {
            const overview = getCompetitionOverview(league, competition.id);
            const accent = getCompetitionAccent(competitions, competition.id);
            const isActive = competition.id === activeCompetitionId;
            return (
              <button
                className={isActive ? "active" : ""}
                key={competition.id}
                type="button"
                onClick={() => onSelectCompetition(competition.id)}
              >
                <CompetitionMark accent={accent} label={competition.name} />
                <span>
                  <strong>{competition.name}</strong>
                  <small>{competition.season || league.season} | {competitionTypeLabel(competition.type)}</small>
                </span>
                <em>{isActive ? "Actual" : `${overview.teamCount} equipos`}</em>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function buildPublicSpotlights(league) {
  const finished = finishedMatches(league).sort((a, b) => (
    Number(b.round || 0) - Number(a.round || 0) ||
    String(b.date).localeCompare(String(a.date))
  ));
  const latestRound = finished[0]?.round;
  const latestMatches = latestRound ? finished.filter((match) => Number(match.round) === Number(latestRound)) : [];
  const playerStats = calculatePlayerStats(league);
  const standings = calculateStandings(league);
  const cardsByTeam = new Map(league.teams.map((team) => [team.id, 0]));

  for (const match of latestMatches) {
    for (const event of match.events || []) {
      if (event.type === "yellow") cardsByTeam.set(event.teamId, (cardsByTeam.get(event.teamId) || 0) + 1);
      if (event.type === "red") cardsByTeam.set(event.teamId, (cardsByTeam.get(event.teamId) || 0) + 3);
    }
  }

  const topScorerRound = (() => {
    const goals = new Map();
    for (const match of latestMatches) {
      for (const event of match.events || []) {
        if (event.type !== "goal") continue;
        goals.set(event.playerId, (goals.get(event.playerId) || 0) + 1);
      }
    }
    return [...goals.entries()].sort((a, b) => b[1] - a[1])[0] || null;
  })();

  const bestWin = latestMatches
    .filter((match) => match.status === "finished" || match.status === "walkover")
    .map((match) => ({
      match,
      margin: Math.abs(Number(match.homeGoals || 0) - Number(match.awayGoals || 0))
    }))
    .sort((a, b) => b.margin - a.margin)[0]?.match;

  const topTeams = standings.slice(0, 2).map((row) => row.team.id);
  const featuredMatch = league.matches.find((match) => (
    isPublicScheduledMatch(match) &&
    topTeams.includes(match.homeTeamId) &&
    topTeams.includes(match.awayTeamId)
  ));

  const fairTeam = [...cardsByTeam.entries()]
    .filter(([teamId]) => latestMatches.some((match) => match.homeTeamId === teamId || match.awayTeamId === teamId))
    .sort((a, b) => a[1] - b[1])
    .map(([teamId]) => getTeam(league, teamId))[0];

  const player = topScorerRound ? playerStats.find((row) => row.player.id === topScorerRound[0]) : null;
  const winningTeam = bestWin
    ? getTeam(league, Number(bestWin.homeGoals || 0) >= Number(bestWin.awayGoals || 0) ? bestWin.homeTeamId : bestWin.awayTeamId)
    : null;

  return [
    {
      label: "Jugador de la jornada",
      title: player?.player.name || "Por definir",
      detail: player ? `${topScorerRound[1]} gol(es) en la jornada ${latestRound}` : "Se activara al capturar goles."
    },
    {
      label: "Equipo de la jornada",
      title: winningTeam?.name || "Por definir",
      detail: bestWin ? `Victoria por diferencia de ${Math.abs(bestWin.homeGoals - bestWin.awayGoals)} gol(es).` : "Se activara con resultados capturados."
    },
    {
      label: "Partido destacado",
      title: featuredMatch ? `${getTeam(league, featuredMatch.homeTeamId)?.name || "LOCAL"} VS ${getTeam(league, featuredMatch.awayTeamId)?.name || "VISITANTE"}` : "Por definir",
      detail: featuredMatch ? "Duelo directo en la parte alta." : "Se detectara cuando haya cruces importantes."
    },
    {
      label: "Juego limpio",
      title: fairTeam?.name || "Por definir",
      detail: fairTeam ? "Menor carga disciplinaria de la jornada." : "Se activara al capturar tarjetas."
    }
  ];
}

function buildFairPlayTeams(league) {
  const cards = new Map(league.teams.map((team) => [team.id, { team, yellow: 0, red: 0, points: 0 }]));
  for (const match of league.matches) {
    for (const event of match.events || []) {
      if (!cards.has(event.teamId)) continue;
      const row = cards.get(event.teamId);
      if (event.type === "yellow") row.yellow += 1;
      if (event.type === "red") row.red += 1;
      row.points = row.yellow + row.red * 3;
    }
  }
  return [...cards.values()].sort((a, b) => a.points - b.points || a.team.name.localeCompare(b.team.name));
}

function RestingTeams({ teams }) {
  if (!teams.length) return null;

  return (
    <article className="rest-card">
      <span>Descansa</span>
      <strong>{teams.map((team) => team.name).join(", ")}</strong>
    </article>
  );
}

function sortPublicMatches(matches) {
  return [...matches].sort((a, b) => (
    String(a.date || "").localeCompare(String(b.date || "")) ||
    String(a.time || "").localeCompare(String(b.time || "")) ||
    Number(a.round || 0) - Number(b.round || 0)
  ));
}

function sortRecentMatches(matches) {
  return [...matches].sort((a, b) => (
    String(b.date || "").localeCompare(String(a.date || "")) ||
    String(b.time || "").localeCompare(String(a.time || "")) ||
    Number(b.round || 0) - Number(a.round || 0)
  ));
}

function getPublicSearchResults(league, stats, query, selectedCompetitionId) {
  const term = normalizeSearchTerm(query);
  if (term.length < 2) return [];
  const statsByPlayer = new Map((stats || []).map((row) => [row.player.id, row]));
  const competitionName = (competitionId) => getCompetition(league, competitionId)?.name || "Torneo";
  const teamResults = league.teams
    .filter((team) => matchesSearchQuery([team.name, team.shortName], term))
    .map((team) => ({
      id: team.id,
      type: "team",
      href: "#equipos",
      name: team.name,
      competitionId: team.competitionId || selectedCompetitionId,
      isCurrentCompetition: (team.competitionId || selectedCompetitionId) === selectedCompetitionId,
      detail: `${competitionName(team.competitionId || selectedCompetitionId)} | ${league.players.filter((player) => player.teamId === team.id).length} jugador(es)`
    }));
  const playerResults = league.players
    .filter((player) => {
      const team = getTeam(league, player.teamId);
      return matchesSearchQuery([player.name, player.number, team?.name, team?.shortName], term);
    })
    .map((player) => {
      const row = statsByPlayer.get(player.id);
      const team = row?.team || getTeam(league, player.teamId);
      const competitionId = player.competitionId || team?.competitionId || selectedCompetitionId;
      return {
        id: player.id,
        type: "player",
        href: "#jugador",
        name: player.name,
        competitionId,
        isCurrentCompetition: competitionId === selectedCompetitionId,
        detail: `${team?.name || "Sin equipo"} | ${competitionName(competitionId)} | ${row?.goals || 0} gol(es)`
      };
    });
  const matchResults = league.matches
    .filter((match) => {
      const home = getTeam(league, match.homeTeamId)?.name || "";
      const away = getTeam(league, match.awayTeamId)?.name || "";
      return matchesSearchQuery([home, away, match.venue, match.date, match.time, `jornada ${match.round || ""}`, `j${match.round || ""}`], term);
    })
    .map((match) => ({
      id: match.id,
      type: "match",
      href: "#calendario",
      name: getMatchShortTitle(league, match),
      competitionId: match.competitionId || selectedCompetitionId,
      isCurrentCompetition: (match.competitionId || selectedCompetitionId) === selectedCompetitionId,
      round: match.round,
      detail: `${competitionName(match.competitionId || selectedCompetitionId)} | ${match.round ? `Jornada ${match.round}` : "Partido"} | ${match.date ? formatDate(match.date) : "Fecha por definir"}`
    }));

  return [...teamResults, ...playerResults, ...matchResults]
    .sort((a, b) => (
      Number((b.competitionId || "") === selectedCompetitionId) - Number((a.competitionId || "") === selectedCompetitionId) ||
      a.name.localeCompare(b.name)
    ))
    .slice(0, 8);
}

function getRoundMatchSearchResults(league, matches, query) {
  const term = normalizeSearchTerm(query);
  if (term.length < 2) return [];
  return matches
    .map((match) => {
      const homeTeam = getTeam(league, match.homeTeamId);
      const awayTeam = getTeam(league, match.awayTeamId);
      const statusLabel = getMatchStatusLabel(match);
      const title = `${homeTeam?.name || "LOCAL"} vs ${awayTeam?.name || "VISITANTE"}`;
      const detailParts = [
        match.date ? formatDate(match.date) : "Fecha por definir",
        match.time ? `${match.time} hrs` : "Hora por definir",
        match.venue || "Cancha por definir",
        statusLabel
      ];
      const searchable = normalizeSearchTerm([
        title,
        homeTeam?.shortName,
        awayTeam?.shortName,
        match.venue,
        match.date,
        match.time,
        statusLabel,
        `jornada ${match.round || ""}`,
        `j${match.round || ""}`
      ].filter(Boolean).join(" "));
      const exactMatch = searchable.includes(term);
      const looseMatch = exactMatch || matchesSearchQuery(searchable, term);
      return {
        id: match.id,
        title,
        label: `J${match.round || "-"}`,
        detail: detailParts.join(" | "),
        rank: searchable.startsWith(term) ? 0 : exactMatch ? 1 : looseMatch ? 1.5 : 2,
        searchable
      };
    })
    .filter((result) => result.rank < 2)
    .sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title))
    .slice(0, 6);
}

function matchesSearchQuery(values, query) {
  const searchable = Array.isArray(values)
    ? normalizeSearchTerm(values.filter(Boolean).join(" "))
    : normalizeSearchTerm(values);
  const term = normalizeSearchTerm(query);
  if (!term) return true;
  if (searchable.includes(term) || isLooseSearchMatch(searchable, term)) return true;
  const tokens = term.split(/\s+/).filter((token) => token.length >= 2);
  if (!tokens.length) return false;
  return tokens.every((token) => searchable.includes(token) || isLooseSearchMatch(searchable, token));
}

function isLooseSearchMatch(searchable, term) {
  if (term.length < 4) return false;
  const compactSearchable = searchable.replace(/[^a-z0-9]+/g, "");
  const compactTerm = term.replace(/[^a-z0-9]+/g, "");
  if (compactSearchable.includes(compactTerm)) return true;
  const consonants = (value) => value.replace(/[aeiou]/g, "");
  const compactTermConsonants = consonants(compactTerm);
  return compactTermConsonants.length >= 3 && consonants(compactSearchable).includes(compactTermConsonants);
}

function normalizeSearchTerm(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-MX")
    .trim();
}

function sharePublicItem({ title, text, url }) {
  const shareData = { title, text, url };
  if (navigator.share) {
    navigator.share(shareData).catch(() => {});
    return;
  }
  shareWhatsAppItem({ text, url });
}

function shareWhatsAppItem({ text, url }) {
  const message = encodeURIComponent(`${text}\n${url}`);
  window.open(`https://wa.me/?text=${message}`, "_blank", "noopener,noreferrer");
}

function getLeaguePublicUrl(league, competition = null) {
  const leagueId = league?.id ? encodeURIComponent(league.id) : "";
  if (!leagueId) return typeof window !== "undefined" ? window.location.href : "";
  const activeCompetition = competition || getCompetition(league, league.currentCompetitionId);
  const basePath = `/liga/${leagueId}`;
  if (typeof window === "undefined") {
    if (!activeCompetition?.id) return basePath;
    return `${basePath}?temporada=${encodeURIComponent(getSeasonId(getSeasonValue(activeCompetition, league)))}&torneo=${encodeURIComponent(activeCompetition.id)}`;
  }
  const url = new URL(basePath, window.location.origin);
  if (activeCompetition?.id) {
    url.searchParams.set("temporada", getSeasonId(getSeasonValue(activeCompetition, league)));
    url.searchParams.set("torneo", activeCompetition.id);
  }
  return url.toString();
}

async function shareStandingsCard({ league, competition, standings }) {
  const title = `Tabla de posiciones | ${league.name}`;
  const url = getLeaguePublicUrl(league, competition);
  await shareGeneratedCard({
    fileName: "tabla-posiciones.png",
    imageBuilder: () => createStandingsShareImage({ league, competition, standings }),
    title,
    text: `${title}\nConsulta la tabla completa de ${league.name}:`,
    url
  });
}

async function shareRoundCard({ league, selectedRound, matches }) {
  const title = `Jornada ${selectedRound || ""} | ${league.name}`;
  const url = getLeaguePublicUrl(league, getCompetition(league, league.currentCompetitionId));
  await shareGeneratedCard({
    fileName: `jornada-${selectedRound || "partidos"}.png`,
    imageBuilder: () => createRoundShareImage({ league, selectedRound, matches }),
    title,
    text: `${title}\nConsulta calendario, resultados y tabla de la liga:`,
    url
  });
}

async function shareScorersCard({ league, competition, scorers }) {
  const url = getLeaguePublicUrl(league, competition);
  await shareGeneratedCard({
    fileName: "tabla-goleo.png",
    imageBuilder: () => createScorersShareImage({ league, competition, scorers: scorers.slice(0, 10) }),
    title: `Tabla de goleo | ${league.name}`,
    text: `Tabla de goleo | ${league.name}\nConsulta estadisticas completas de la liga:`,
    url
  });
}

async function shareSuspensionsCard({ league, competition, notices }) {
  const url = getLeaguePublicUrl(league, competition);
  await shareGeneratedCard({
    fileName: "expulsados-regresos.png",
    imageBuilder: () => createSuspensionsShareImage({ league, competition, notices }),
    title: `Expulsados y regresos | ${league.name}`,
    text: `Expulsados y regresos | ${league.name}\nConsulta disciplina y resultados de la liga:`,
    url
  });
}

async function shareYellowCardsCard({ league, competition, rows }) {
  const url = getLeaguePublicUrl(league, competition);
  await shareGeneratedCards({
    fileBaseName: "tarjetas-amarillas",
    imageBuilders: createYellowCardsShareImages({ league, competition, rows }),
    title: `Tarjetas amarillas | ${league.name}`,
    text: `Tarjetas amarillas | ${league.name}\nConsulta disciplina y resultados de la liga:`,
    url
  });
}

async function shareFeaturedMatchCard({ league, match }) {
  const url = getLeaguePublicUrl(league, getCompetition(league, match?.competitionId || league.currentCompetitionId));
  await shareGeneratedCard({
    fileName: "partido-destacado.png",
    imageBuilder: () => createFeaturedMatchShareImage({ league, match }),
    title: `Partido destacado | ${league.name}`,
    text: `Partido destacado | ${league.name}\nConsulta la informacion completa de la liga:`,
    url
  });
}

async function sharePublicMatchActaCard({ league, match }) {
  const competition = getCompetition(league, match?.competitionId || league.currentCompetitionId);
  const home = getTeam(league, match?.homeTeamId);
  const away = getTeam(league, match?.awayTeamId);
  const title = `Acta publica | ${home?.name || "LOCAL"} vs ${away?.name || "VISITANTE"}`;
  const text = `${title}\n${league.name} | Jornada ${match?.round || "-"}\nConsulta la informacion completa de la liga:`;
  await shareGeneratedCard({
    fileName: "acta-publica-partido.png",
    imageBuilder: () => createPublicMatchActaShareImage({ league, competition, match }),
    title,
    text,
    url: getLeaguePublicUrl(league, competition)
  });
}

async function shareGeneratedCard({ fileName, imageBuilder, title = "LIGATEC", text = "", url = "" }) {
  await shareGeneratedCards({ fileName, imageBuilders: [imageBuilder], title, text, url });
}

async function shareGeneratedCards({ fileBaseName = "ligatec", fileName, imageBuilders, title = "LIGATEC", text = "", url = "" }) {
  const blobs = [];

  try {
    for (const imageBuilder of imageBuilders) {
      const canvas = await imageBuilder();
      blobs.push(await canvasToPngBlob(canvas));
    }
  } catch (error) {
    window.alert("No se pudo generar la imagen para compartir. Intentalo de nuevo.");
    return;
  }

  const files = blobs.map((blob, index) => {
    const resolvedName = blobs.length === 1
      ? fileName || `${fileBaseName}.png`
      : `${fileBaseName}-${index + 1}.png`;
    return new File([blob], resolvedName, { type: "image/png" });
  });
  const shareText = [text, url].filter(Boolean).join("\n\n");
  const shareData = {
    files,
    ...(title ? { title } : {}),
    ...(shareText ? { text: shareText } : {})
  };

  if (canShareGeneratedFile(shareData)) {
    try {
      await navigator.share(shareData);
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
  }

  if (blobs.length === 1 && await copyImageBlobToClipboard(blobs[0])) {
    window.alert(shareText
      ? `Imagen copiada. Pega la imagen en WhatsApp y agrega este texto:\n\n${shareText}`
      : "Imagen copiada. Abre WhatsApp y pegala en el chat para enviarla como imagen."
    );
    return;
  }

  blobs.forEach((blob, index) => {
    const resolvedName = blobs.length === 1
      ? fileName || `${fileBaseName}.png`
      : `${fileBaseName}-${index + 1}.png`;
    downloadBlob(blob, resolvedName);
  });
  window.alert(blobs.length === 1
    ? `Tu navegador no permite adjuntar la imagen directamente. Se descargo el PNG para enviarlo como imagen.\n\nLink para compartir:\n${shareText}`
    : `Tu navegador no permite adjuntar varias imagenes directamente. Se descargaron ${blobs.length} PNG para enviarlos por WhatsApp.\n\nLink para compartir:\n${shareText}`
  );
}

function canShareGeneratedFile(shareData) {
  if (!navigator.share) return false;
  if (!navigator.canShare) return true;

  try {
    return navigator.canShare(shareData);
  } catch {
    return false;
  }
}

function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("No se pudo generar la imagen."));
        return;
      }
      resolve(blob);
    }, "image/png", 0.96);
  });
}

async function copyImageBlobToClipboard(blob) {
  if (!navigator.clipboard || typeof window.ClipboardItem === "undefined") return false;

  try {
    await navigator.clipboard.write([
      new window.ClipboardItem({ [blob.type]: blob })
    ]);
    return true;
  } catch {
    return false;
  }
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function createShareCanvas(width, height) {
  const canvas = document.createElement("canvas");
  const ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  const context = canvas.getContext("2d");
  context.scale(ratio, ratio);
  context.textBaseline = "top";
  return { canvas, context };
}

async function createStandingsShareImage({ league, competition, standings }) {
  const rows = standings;
  const width = 1080;
  const rowHeight = 70;
  const height = Math.max(760, 358 + rows.length * rowHeight + 96);
  const { canvas, context } = createShareCanvas(width, height);
  const playoffQualifiers = Math.max(0, Number(league.rules?.playoffQualifiers ?? 8));
  const qualifiedCount = Math.min(playoffQualifiers, rows.length);
  const playoffLabel = getPlayoffPhaseLabel(playoffQualifiers);
  const leader = rows[0];
  const bestAttack = [...rows].sort((a, b) => b.goalsFor - a.goalsFor || b.points - a.points)[0];
  const bestDefense = [...rows].sort((a, b) => a.goalsAgainst - b.goalsAgainst || b.points - a.points)[0];
  const insights = [
    leader ? ["LIDER", leader.team.name, `${leader.points} PTS`] : null,
    bestAttack ? ["MEJOR OFENSIVA", bestAttack.team.name, `${bestAttack.goalsFor} GF`] : null,
    bestDefense ? ["MEJOR DEFENSA", bestDefense.team.name, `${bestDefense.goalsAgainst} GC`] : null
  ].filter(Boolean);

  drawShareBackground(context, width, height, league);
  await drawShareHeader(context, width, {
    eyebrow: getShareHeaderEyebrow(league, { competition, detail: competition?.season || league.season }),
    league,
    title: "TABLA DE POSICIONES"
  });

  if (qualifiedCount > 0) {
    drawRoundedRect(context, 60, 144, width - 120, 34, 10, "rgba(15, 107, 79, 0.08)");
    context.fillStyle = "#0f6b4f";
    context.font = "850 21px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    context.fillText(`Zona de liguilla - Puestos 1 al ${qualifiedCount}${playoffLabel ? ` | ${playoffLabel}` : ""}`, 80, 151);
  }

  insights.forEach(([label, teamName, value], index) => {
    const cardWidth = 304;
    const cardHeight = 122;
    const x = 60 + index * 328;
    const y = 190;
    drawRoundedRect(context, x, y, cardWidth, cardHeight, 18, "rgba(4, 33, 28, 0.94)");
    context.strokeStyle = "rgba(43, 255, 135, 0.34)";
    context.lineWidth = 2;
    context.stroke();
    drawRoundedRect(context, x, y, 7, cardHeight, 4, "#8cff45");
    context.fillStyle = label === "LIDER" ? "#8cff45" : "#f8fffb";
    drawCanvasFittedText(context, label, x + 28, y + 24, cardWidth - 56, 18, 15, 950);
    context.fillStyle = "#ffffff";
    drawCanvasFittedText(context, teamName.toLocaleUpperCase("es-MX"), x + 28, y + 56, cardWidth - 56, 24, 17, 950);
    context.fillStyle = "#7be34d";
    drawCanvasFittedText(context, value, x + 28, y + 88, cardWidth - 56, 28, 22, 1000);
  });

  const boardY = 338;
  const boardHeight = rows.length * rowHeight + 74;
  drawRoundedRect(context, 42, boardY, width - 84, boardHeight, 22, "rgba(1, 12, 17, 0.82)");
  context.strokeStyle = "rgba(43, 255, 135, 0.45)";
  context.lineWidth = 2;
  context.stroke();

  [
    ["POS", 78],
    ["EQUIPO", 162],
    ["PJ", 502],
    ["G", 572],
    ["E", 642],
    ["P", 712],
    ["GF", 782],
    ["GC", 852],
    ["DG", 922],
    ["PTS", 990]
  ].forEach(([label, x]) => drawShareLabel(context, label, x, boardY + 28, label === "PTS" ? "#ffffff" : "#8cff45"));

  rows.forEach((row, index) => {
    const y = boardY + 64 + index * rowHeight;
    const rank = index + 1;
    const isQualified = index < qualifiedCount;
    if (qualifiedCount > 0 && index === qualifiedCount) {
      context.strokeStyle = "rgba(140, 247, 76, 0.62)";
      context.setLineDash([8, 8]);
      context.beginPath();
      context.moveTo(74, y - 10);
      context.lineTo(width - 74, y - 10);
      context.stroke();
      context.setLineDash([]);
    }
    drawRoundedRect(context, 62, y, width - 124, 56, 14, rank <= 3 || isQualified ? "rgba(12, 72, 52, 0.74)" : "rgba(7, 24, 31, 0.88)");
    if (isQualified) drawRoundedRect(context, 62, y, 6, 56, 4, "#8cff45");
    const accent = rank === 2 ? "#44caff" : rank <= 3 ? "#8cff45" : "#0fbf9b";
    drawRoundedRect(context, 78, y + 9, 38, 38, 10, rank <= 3 ? accent : "rgba(4, 48, 39, 0.95)");
    context.fillStyle = rank === 1 || rank === 3 ? "#06140e" : "#ffffff";
    context.font = "950 20px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    context.fillText(String(rank), 91, y + 17);

    drawTeamBubble(context, row.team, 142, y + 10, 36);
    context.fillStyle = "#ffffff";
    context.font = "900 22px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    drawCanvasText(context, row.team.name.toLocaleUpperCase("es-MX"), 194, y + 16, 280, 24, 1);

    context.fillStyle = "#ffffff";
    drawShareStatCell(context, row.played, 510, y + 18);
    drawShareStatCell(context, row.wins, 580, y + 18);
    drawShareStatCell(context, row.draws, 650, y + 18);
    drawShareStatCell(context, row.losses, 720, y + 18);
    drawShareStatCell(context, row.goalsFor, 790, y + 18);
    drawShareStatCell(context, row.goalsAgainst, 860, y + 18);
    drawShareStatCell(context, row.goalDifference, 930, y + 18);
    drawRoundedRect(context, 988, y + 8, 46, 40, 10, rank === 1 ? "#8cff45" : "#138f7e");
    context.fillStyle = rank === 1 ? "#06140e" : "#ffffff";
    context.font = "950 22px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    context.fillText(String(row.points), 1002, y + 17);
  });

  drawShareFooter(context, width, height, league);
  return canvas;
}

async function createRoundShareImage({ league, selectedRound, matches }) {
  const rows = sortPublicMatches(matches);
  const width = 1080;
  const height = 238 + rows.length * 92 + 78;
  const { canvas, context } = createShareCanvas(width, height);

  drawShareBackground(context, width, height, league);
  await drawShareHeader(context, width, {
    eyebrow: getShareHeaderEyebrow(league, { detail: selectedRound ? `Jornada ${selectedRound}` : league.season }),
    league,
    title: `JORNADA ${selectedRound || "-"}`
  });

  rows.forEach((match, index) => {
    const y = 180 + index * 92;
    const home = getTeam(league, match.homeTeamId);
    const away = getTeam(league, match.awayTeamId);
    const isFinished = match.status === "finished" || match.status === "walkover";
    const center = isFinished ? `${match.homeGoals ?? 0}-${match.awayGoals ?? 0}` : "VS";

    drawRoundedRect(context, 60, y, width - 120, 74, 16, "#ffffff");
    drawRoundedRect(context, 78, y + 14, 112, 46, 12, "#e9f7ef");
    context.fillStyle = "#0f6b4f";
    context.font = "950 22px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    context.fillText(match.time || "--:--", 98, y + 25);

    drawTeamBubble(context, home, 220, y + 20, 34);
    context.fillStyle = "#11231d";
    context.font = "900 24px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    drawCanvasText(context, home?.name || "LOCAL", 262, y + 19, 260, 27, 1);

    drawRoundedRect(context, 528, y + 17, 80, 40, 12, "#0f6b4f");
    context.fillStyle = "#ffffff";
    context.font = "950 22px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    context.fillText(center, 552 - (center.length > 2 ? 6 : 0), y + 26);

    drawTeamBubble(context, away, 640, y + 20, 34);
    context.fillStyle = "#11231d";
    context.font = "900 24px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    drawCanvasText(context, away?.name || "VISITANTE", 682, y + 19, 280, 27, 1);

    context.fillStyle = "#66736c";
    context.font = "850 20px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    drawCanvasText(context, `${match.date ? formatDate(match.date) : "Fecha por definir"} | ${match.venue || "Cancha por definir"}`, 220, y + 50, 730, 24, 1);
  });

  drawShareFooter(context, width, height, league);
  return canvas;
}

async function createScorersShareImage({ league, competition, scorers }) {
  const rows = scorers;
  const width = 1080;
  const rowHeight = 64;
  const height = Math.max(520, 232 + Math.max(rows.length, 1) * rowHeight + 86);
  const { canvas, context } = createShareCanvas(width, height);

  drawShareBackground(context, width, height, league);
  await drawShareHeader(context, width, {
    eyebrow: getShareHeaderEyebrow(league, { competition, detail: competition?.season || league.season }),
    league,
    title: "TOP 10 GOLEO"
  });

  drawRoundedRect(context, 60, 166, width - 120, 42, 12, "#e9f7ef");
  drawShareLabel(context, "#", 84, 178, "#0f2f24");
  drawShareLabel(context, "JUGADOR", 160, 178, "#0f2f24");
  drawShareLabel(context, "EQUIPO", 640, 178, "#0f2f24");
  drawShareLabel(context, "GOLES", 900, 178, "#0f2f24");

  if (!rows.length) {
    drawShareEmptyState(context, "Aun no hay goles registrados.", 60, 236, width - 120);
  }

  rows.forEach((row, index) => {
    const y = 224 + index * rowHeight;
    const rank = index + 1;
    drawRoundedRect(context, 60, y, width - 120, 52, 14, rank <= 3 ? "#09261f" : "#ffffff");
    drawRoundedRect(context, 78, y + 9, 40, 34, 10, rank === 1 ? "#e7c948" : rank === 2 ? "#34699a" : rank === 3 ? "#b6e35c" : "#0f6b4f");
    context.fillStyle = rank === 1 || rank === 3 ? "#102016" : "#ffffff";
    context.font = "900 20px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    context.fillText(String(rank), 92, y + 15);
    drawTeamBubble(context, row.team, 140, y + 9, 34);
    context.fillStyle = rank <= 3 ? "#ffffff" : "#11231d";
    context.font = "900 24px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    drawCanvasText(context, row.player.name, 186, y + 13, 390, 27, 1);
    context.fillStyle = rank <= 3 ? "#d7e5de" : "#64736b";
    context.font = "850 20px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    drawCanvasText(context, row.team?.name || "Sin equipo", 640, y + 16, 220, 22, 1);
    context.fillStyle = rank <= 3 ? "#dff7e9" : "#0f6b4f";
    context.font = "950 28px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    context.fillText(String(row.goals), 920, y + 11);
  });

  drawShareFooter(context, width, height, league);
  return canvas;
}

async function createSuspensionsShareImage({ league, competition, notices }) {
  const rows = notices;
  const width = 1080;
  const rowHeight = 82;
  const height = Math.max(520, 226 + Math.max(rows.length, 1) * rowHeight + 92);
  const { canvas, context } = createShareCanvas(width, height);

  drawShareBackground(context, width, height, league);
  await drawShareHeader(context, width, {
    eyebrow: getShareHeaderEyebrow(league, { competition, detail: "Siguiente jornada" }),
    league,
    title: "EXPULSADOS Y REGRESOS"
  });

  if (!rows.length) {
    drawShareEmptyState(context, "No hay jugadores suspendidos para la siguiente jornada.", 60, 184, width - 120);
  }

  rows.forEach((notice, index) => {
    const y = 178 + index * rowHeight;
    const tone = notice.pendingReview ? "#f97316" : notice.indefinite ? "#7f1d1d" : notice.status === "suspended" ? "#b91c1c" : "#0f6b4f";
    drawRoundedRect(context, 60, y, width - 120, 68, 16, "#ffffff");
    drawRoundedRect(context, 76, y + 12, 52, 44, 12, tone);
    context.fillStyle = "#ffffff";
    context.font = "950 16px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    context.fillText(notice.type === "Expulsion" ? "ROJA" : "SANC", 82, y + 24);
    context.fillStyle = "#11231d";
    context.font = "900 24px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    drawCanvasText(context, notice.player.name, 150, y + 12, 390, 27, 1);
    context.fillStyle = "#64736b";
    context.font = "850 18px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    drawCanvasText(context, notice.team?.name || "Sin equipo", 150, y + 40, 390, 22, 1);
    context.fillStyle = tone;
    context.font = "900 21px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    const status = notice.pendingReview
      ? "SUJETO A COMISION"
      : notice.indefinite
      ? "INHABILITADO INDEFINIDO"
      : notice.returnRound
        ? `REGRESA J${notice.returnRound}`
        : `${notice.remainingMatches || 0} JUEGO(S) RESTANTE(S)`;
    drawCanvasText(context, status, 580, y + 16, 360, 24, 1);
    context.fillStyle = "#64736b";
    context.font = "800 17px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    drawCanvasText(context, notice.reason || "Sancion registrada", 580, y + 42, 360, 20, 1);
  });

  drawShareFooter(context, width, height, league);
  return canvas;
}

function createYellowCardsShareImages({ league, competition, rows }) {
  const pageSize = 8;
  const chunks = chunkShareRows(rows, pageSize);
  const pages = chunks.length ? chunks : [[]];
  return pages.map((pageRows, index) => (
    () => createYellowCardsShareImage({
      league,
      competition,
      page: index + 1,
      rows: pageRows,
      totalPages: pages.length,
      totalRows: rows.length
    })
  ));
}

async function createYellowCardsShareImage({ league, competition, page = 1, rows, totalPages = 1, totalRows = rows.length }) {
  const width = 1080;
  const rowHeight = 78;
  const height = Math.max(620, 238 + Math.max(rows.length, 1) * rowHeight + 106);
  const { canvas, context } = createShareCanvas(width, height);

  drawShareBackground(context, width, height, league);
  await drawShareHeader(context, width, {
    eyebrow: getShareHeaderEyebrow(league, {
      competition,
      detail: totalPages > 1 ? `Disciplina | Pagina ${page} de ${totalPages}` : "Disciplina"
    }),
    league,
    title: "TARJETAS AMARILLAS"
  });

  drawRoundedRect(context, 60, 166, width - 120, 42, 12, "#fff7d8");
  drawShareLabel(context, "JUGADOR", 86, 178, "#4c3b00");
  drawShareLabel(context, "EQUIPO", 520, 178, "#4c3b00");
  drawShareLabel(context, "AMARILLAS", 800, 178, "#4c3b00");

  if (!rows.length) {
    drawShareEmptyState(context, "Sin amarillas vigentes registradas.", 60, 236, width - 120);
  }

  rows.forEach((row, index) => {
    const y = 226 + index * rowHeight;
    const danger = row.status === "suspended";
    drawRoundedRect(context, 60, y, width - 120, 64, 14, danger ? "#fff1f2" : "#ffffff");
    context.fillStyle = "#11231d";
    context.font = "900 24px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    drawCanvasText(context, row.player.name, 86, y + 10, 370, 27, 1);
    context.fillStyle = "#64736b";
    context.font = "850 19px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    drawCanvasText(context, row.team?.name || "Sin equipo", 520, y + 20, 230, 22, 1);
    drawRoundedRect(context, 808, y + 14, 96, 38, 12, danger ? "#ef4444" : "#facc15");
    context.fillStyle = danger ? "#ffffff" : "#3b2f00";
    context.font = "950 22px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    context.fillText(`${row.yellowCards}/${row.yellowLimit}`, 834, y + 21);
    context.fillStyle = danger ? "#b91c1c" : "#64736b";
    context.font = "800 17px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    drawCanvasText(context, row.message, 86, y + 40, 820, 19, 1);
  });

  if (totalPages > 1) {
    context.fillStyle = "#64736b";
    context.font = "850 20px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    context.fillText(`Pagina ${page} de ${totalPages} | ${totalRows} jugador(es) con amarillas vigentes`, 60, height - 76);
  }

  drawShareFooter(context, width, height, league);
  return canvas;
}

async function createFeaturedMatchShareImage({ league, match }) {
  const width = 1080;
  const height = 620;
  const { canvas, context } = createShareCanvas(width, height);
  const home = getTeam(league, match.homeTeamId);
  const away = getTeam(league, match.awayTeamId);
  const isFinished = match.status === "finished" || match.status === "walkover";
  const center = isFinished ? `${match.homeGoals ?? 0} - ${match.awayGoals ?? 0}` : "VS";

  drawShareBackground(context, width, height, league);
  await drawShareHeader(context, width, {
    eyebrow: getShareHeaderEyebrow(league, { detail: match.round ? `Jornada ${match.round}` : league.season }),
    league,
    title: isFinished ? "PARTIDO DE LA JORNADA" : "PROXIMO PARTIDO"
  });

  drawRoundedRect(context, 78, 178, width - 156, 300, 28, "#ffffff");
  context.fillStyle = "#0f6b4f";
  context.font = "950 24px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  context.fillText(isFinished ? "RESULTADO" : "PROGRAMADO", 440, 208);
  drawTeamBubble(context, home, 170, 250, 86);
  drawTeamBubble(context, away, width - 256, 250, 86);
  context.fillStyle = "#11231d";
  context.font = "950 34px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  drawCanvasText(context, home?.name || "LOCAL", 90, 360, 250, 38, 2);
  drawCanvasText(context, away?.name || "VISITANTE", width - 340, 360, 250, 38, 2);
  drawRoundedRect(context, 424, 262, 232, 86, 18, "#0f6b4f");
  context.fillStyle = "#ffffff";
  context.font = "950 52px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  context.textAlign = "center";
  context.fillText(center, width / 2, 278);
  context.textAlign = "left";
  context.fillStyle = "#64736b";
  context.font = "900 24px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  const details = [match.date ? formatDate(match.date) : "Fecha por definir", match.time ? `${match.time} hrs` : "Hora por definir", match.venue || "Cancha por definir"].join(" | ");
  drawCanvasText(context, details, 160, 500, width - 320, 28, 1);

  drawShareFooter(context, width, height, league);
  return canvas;
}

async function createPublicMatchActaShareImage({ league, competition, match }) {
  const width = 1080;
  const home = getTeam(league, match.homeTeamId);
  const away = getTeam(league, match.awayTeamId);
  const events = sortMatchEvents(match.events || []);
  const homeEvents = events.filter((event) => event.teamId === match.homeTeamId);
  const awayEvents = events.filter((event) => event.teamId === match.awayTeamId);
  const maxEventRows = Math.max(homeEvents.length, awayEvents.length, 1);
  const eventPanelHeight = Math.max(430, 176 + maxEventRows * 82);
  const refereeCrew = getPublicMatchRefereeCrew(league, match);
  const hasNotes = Boolean(match.observations || match.resolutionNote);
  const crewHeight = refereeCrew.length ? 146 : 0;
  const notesHeight = hasNotes ? 152 : 0;
  const height = 612 + eventPanelHeight + crewHeight + notesHeight + 154;
  const { canvas, context } = createShareCanvas(width, height);
  const statusLabel = getMatchStatusLabel(match);
  const score = `${match.homeGoals ?? 0} - ${match.awayGoals ?? 0}`;
  const actaId = `#${String(competition?.name || league.season || "LIGA").slice(0, 3).toLocaleUpperCase("es-MX")}-J${match.round || "-"}-${String(match.date || "").slice(0, 4) || new Date().getFullYear()}`;

  drawActaBackground(context, width, height);
  await drawLigatecCanvasBrand(context, 310, 34, 460, 98);

  context.fillStyle = "#75f05f";
  context.font = "950 22px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  context.fillText("ACTA PUBLICA", 820, 72);
  context.fillStyle = "rgba(236, 255, 246, 0.76)";
  context.font = "850 18px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  context.fillText(`ID: ${actaId}`, 820, 106);

  drawRoundedRect(context, 78, 150, 924, 420, 22, "rgba(3, 18, 20, 0.82)");
  drawRoundedStroke(context, 78, 150, 924, 420, 22, "rgba(117, 240, 95, 0.38)", 2);
  drawRoundedStroke(context, 92, 164, 896, 392, 18, "rgba(42, 231, 188, 0.12)", 1);

  context.textAlign = "center";
  context.fillStyle = "#75f05f";
  drawCanvasFittedText(context, String(competition?.name || league.season || "Torneo").toLocaleUpperCase("es-MX"), width / 2, 196, 760, 22, 15, 950);
  context.fillStyle = "#ffffff";
  drawCanvasFittedText(context, `JORNADA ${match.round || "-"}`, width / 2, 252, 440, 58, 34, 1000);

  const meta = [
    match.date ? formatDate(match.date) : "Fecha por definir",
    match.time ? `${match.time} hrs` : "Hora por definir",
    match.venue || "Cancha por definir"
  ];
  context.fillStyle = "rgba(236, 255, 246, 0.86)";
  context.font = "900 22px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  context.fillText(meta.join("   |   ").toLocaleUpperCase("es-MX"), width / 2, 300);

  await drawActaTeamMark(context, home, 172, 340, 118);
  await drawActaTeamMark(context, away, 790, 340, 118);
  context.fillStyle = "#ffffff";
  drawCanvasFittedText(context, String(home?.name || "LOCAL").toLocaleUpperCase("es-MX"), 231, 500, 250, 28, 18, 950);
  drawCanvasFittedText(context, String(away?.name || "VISITANTE").toLocaleUpperCase("es-MX"), 849, 500, 250, 28, 18, 950);
  drawRoundedRect(context, 420, 344, 240, 42, 999, "rgba(117, 240, 95, 0.22)");
  drawRoundedStroke(context, 420, 344, 240, 42, 999, "rgba(117, 240, 95, 0.72)", 1.5);
  context.fillStyle = "#dfffe0";
  context.font = "950 18px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  context.fillText(statusLabel.toLocaleUpperCase("es-MX"), width / 2, 372);
  context.fillStyle = "#ffffff";
  context.font = "1000 76px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  context.fillText(score, width / 2, 468);
  context.textAlign = "left";

  let cursorY = 594;
  drawActaEventsPanel(context, {
    awayEvents,
    awayTeam: away,
    events,
    height: eventPanelHeight,
    homeEvents,
    homeTeam: home,
    league,
    match,
    y: cursorY
  });
  cursorY += eventPanelHeight + 22;

  if (hasNotes) {
    drawActaNotesPanel(context, match, cursorY, width - 156);
    cursorY += notesHeight + 22;
  }

  if (refereeCrew.length) {
    drawActaRefereeCrew(context, refereeCrew, cursorY, width - 156);
    cursorY += crewHeight + 22;
  }

  context.fillStyle = "rgba(117, 240, 95, 0.86)";
  context.font = "850 14px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  context.fillText("LA EVOLUCION DIGITAL DE TU LIGA", 78, height - 66);
  context.textAlign = "center";
  context.fillStyle = "#ffffff";
  context.font = "850 18px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  context.fillText("www.ligatec.mx", width / 2, height - 62);
  context.textAlign = "right";
  context.fillStyle = "rgba(236, 255, 246, 0.7)";
  context.font = "850 13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  context.fillText(`LIGATEC © ${new Date().getFullYear()}`, width - 78, height - 72);
  context.fillText("TODOS LOS DERECHOS RESERVADOS", width - 78, height - 48);
  context.textAlign = "left";

  return canvas;
}

function drawActaBackground(context, width, height) {
  const base = context.createLinearGradient(0, 0, width, height);
  base.addColorStop(0, "#020d0f");
  base.addColorStop(0.46, "#031a1d");
  base.addColorStop(1, "#010607");
  context.fillStyle = base;
  context.fillRect(0, 0, width, height);

  context.strokeStyle = "rgba(117, 240, 95, 0.32)";
  context.lineWidth = 2;
  for (const offset of [-80, -38, 920, 966]) {
    context.beginPath();
    context.moveTo(offset, 0);
    context.lineTo(offset + 360, height);
    context.stroke();
  }

  const glow = context.createRadialGradient(width / 2, 430, 80, width / 2, 430, 620);
  glow.addColorStop(0, "rgba(42, 231, 188, 0.16)");
  glow.addColorStop(0.52, "rgba(117, 240, 95, 0.08)");
  glow.addColorStop(1, "rgba(117, 240, 95, 0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);
}

let genericCanvasImageCache = null;

function loadCanvasImage(src) {
  if (!src) return Promise.reject(new Error("missing image"));
  if (!genericCanvasImageCache) genericCanvasImageCache = new Map();
  if (!genericCanvasImageCache.has(src)) {
    genericCanvasImageCache.set(src, new Promise((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = src;
    }));
  }
  return genericCanvasImageCache.get(src);
}

async function drawActaTeamMark(context, team, x, y, size) {
  context.save();
  context.shadowColor = "rgba(117, 240, 95, 0.32)";
  context.shadowBlur = 24;
  context.beginPath();
  context.arc(x + size / 2, y + size / 2, size / 2 + 8, 0, Math.PI * 2);
  context.fillStyle = "rgba(255, 255, 255, 0.08)";
  context.fill();
  context.restore();

  context.fillStyle = team?.colors || "#0f6b4f";
  context.beginPath();
  context.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = "#ffffff";
  context.lineWidth = 5;
  context.stroke();
  context.strokeStyle = "rgba(117, 240, 95, 0.85)";
  context.lineWidth = 3;
  context.beginPath();
  context.arc(x + size / 2, y + size / 2, size / 2 + 10, 0, Math.PI * 2);
  context.stroke();

  if (team?.logoUrl) {
    try {
      const image = await loadCanvasImage(team.logoUrl);
      const ratio = Math.min((size - 16) / image.width, (size - 16) / image.height);
      const drawWidth = image.width * ratio;
      const drawHeight = image.height * ratio;
      context.save();
      context.beginPath();
      context.arc(x + size / 2, y + size / 2, size / 2 - 7, 0, Math.PI * 2);
      context.clip();
      context.drawImage(image, x + (size - drawWidth) / 2, y + (size - drawHeight) / 2, drawWidth, drawHeight);
      context.restore();
      return;
    } catch {
      // Fallback to initials below.
    }
  }

  context.fillStyle = "#ffffff";
  context.font = "1000 34px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  context.textAlign = "center";
  context.fillText(getTeamInitials(team?.name || "E"), x + size / 2, y + size / 2 - 18);
  context.textAlign = "left";
}

function drawActaEventsPanel(context, { awayEvents, awayTeam, events, height, homeEvents, homeTeam, league, match, y }) {
  const x = 78;
  const width = 924;
  drawRoundedRect(context, x, y, width, height, 18, "rgba(3, 18, 20, 0.86)");
  drawRoundedStroke(context, x, y, width, height, 18, "rgba(117, 240, 95, 0.34)", 2);

  context.fillStyle = "#ffffff";
  context.font = "1000 24px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  context.fillText("EVENTOS DEL PARTIDO", x + 70, y + 42);
  context.fillStyle = "#9aff58";
  context.font = "950 18px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  context.textAlign = "right";
  context.fillText(`${events.length} REGISTRO${events.length === 1 ? "" : "S"}`, x + width - 28, y + 42);
  context.textAlign = "left";

  drawActaLegend(context, x + 250, y + 72);
  const bodyY = y + 118;
  const bodyHeight = height - 142;
  drawRoundedRect(context, x + 12, bodyY, width - 24, bodyHeight, 14, "rgba(0, 24, 21, 0.58)");
  drawRoundedStroke(context, x + 12, bodyY, width - 24, bodyHeight, 14, "rgba(117, 240, 95, 0.24)", 1.5);

  const centerX = x + width / 2;
  context.strokeStyle = "rgba(236, 255, 246, 0.34)";
  context.lineWidth = 1.4;
  context.beginPath();
  context.moveTo(centerX, bodyY + 18);
  context.lineTo(centerX, bodyY + bodyHeight - 18);
  context.stroke();

  context.fillStyle = "#75f05f";
  context.font = "1000 23px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  context.textAlign = "center";
  drawCanvasFittedText(context, String(homeTeam?.name || "LOCAL").toLocaleUpperCase("es-MX"), x + 228, bodyY + 42, 330, 23, 14, 1000);
  drawCanvasFittedText(context, String(awayTeam?.name || "VISITANTE").toLocaleUpperCase("es-MX"), x + 696, bodyY + 42, 330, 23, 14, 1000);
  context.textAlign = "left";

  const maxRows = Math.max(homeEvents.length, awayEvents.length, 1);
  const rowGap = 82;
  for (let index = 0; index < maxRows; index += 1) {
    const rowY = bodyY + 78 + index * rowGap;
    drawActaMinuteNode(context, centerX, rowY + 28, homeEvents[index] || awayEvents[index]);
    if (homeEvents[index]) drawActaEventRow(context, { event: homeEvents[index], league, x: x + 32, y: rowY, width: 320, align: "left" });
    if (awayEvents[index]) drawActaEventRow(context, { event: awayEvents[index], league, x: x + width - 352, y: rowY, width: 320, align: "right" });
  }

  if (!events.length) {
    context.fillStyle = "rgba(236, 255, 246, 0.68)";
    context.font = "900 24px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    context.textAlign = "center";
    context.fillText("Sin eventos capturados en el acta.", centerX, bodyY + bodyHeight / 2 + 8);
    context.textAlign = "left";
  }
}

function drawActaLegend(context, x, y) {
  const items = [
    ["#facc15", "AMARILLA"],
    ["#ef4444", "ROJA"],
    ["#ffffff", "GOL"]
  ];
  let cursorX = x;
  for (const [color, label] of items) {
    if (label === "GOL") {
      context.fillStyle = "#ffffff";
      context.font = "900 24px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      context.fillText("⚽", cursorX, y + 17);
      cursorX += 34;
    } else {
      drawRoundedRect(context, cursorX, y, 18, 22, 4, color);
      cursorX += 30;
    }
    context.fillStyle = "rgba(236, 255, 246, 0.9)";
    context.font = "900 16px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    context.fillText(label, cursorX, y + 17);
    cursorX += context.measureText(label).width + 42;
  }
}

function drawActaMinuteNode(context, x, y, event) {
  drawRoundedRect(context, x - 28, y - 28, 56, 56, 999, "#03181b");
  drawRoundedStroke(context, x - 28, y - 28, 56, 56, 999, "rgba(117, 240, 95, 0.82)", 2);
  context.fillStyle = "#ffffff";
  context.font = "1000 19px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  context.textAlign = "center";
  context.fillText(event && hasEventMinute(event) ? `${getEventMinuteLabel(event)}'` : "0'", x, y + 6);
  context.textAlign = "left";
}

function drawActaEventRow(context, { align = "left", event, league, width, x, y }) {
  const player = getPlayer(league, event.playerId);
  drawRoundedRect(context, x, y, width, 58, 10, "rgba(255, 255, 255, 0.07)");
  drawRoundedStroke(context, x, y, width, 58, 10, "rgba(236, 255, 246, 0.14)", 1);
  const iconX = align === "right" ? x + 18 : x + 16;
  drawActaEventIcon(context, event.type, iconX, y + 16);
  const textX = x + 58;
  context.fillStyle = "#ffffff";
  context.font = "950 18px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  drawCanvasFittedText(context, String(player?.name || "Jugador").toLocaleUpperCase("es-MX"), textX, y + 24, width - 76, 18, 12, 950);
  context.fillStyle = event.type === "yellow" ? "#facc15" : event.type === "red" ? "#ff6666" : "#75f05f";
  context.font = "850 16px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  drawCanvasFittedText(context, getPublicEventDetail(event), textX, y + 48, width - 76, 16, 11, 850);
}

function drawActaEventIcon(context, type, x, y) {
  if (type === "yellow" || type === "red") {
    drawRoundedRect(context, x, y, 20, 26, 4, type === "yellow" ? "#facc15" : "#ef4444");
    return;
  }
  context.fillStyle = "#ffffff";
  context.font = "900 24px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  context.fillText(type === "own_goal" ? "↩" : "⚽", x, y + 23);
}

function drawActaNotesPanel(context, match, y, width) {
  drawRoundedRect(context, 78, y, width, 130, 18, "rgba(3, 18, 20, 0.78)");
  drawRoundedStroke(context, 78, y, width, 130, 18, "rgba(117, 240, 95, 0.24)", 1.6);
  context.fillStyle = "#75f05f";
  context.font = "1000 20px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  context.fillText("NOTAS DEL ACTA", 108, y + 36);
  context.fillStyle = "rgba(236, 255, 246, 0.86)";
  context.font = "850 17px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  drawCanvasText(context, [match.observations, match.resolutionNote].filter(Boolean).join(" | "), 108, y + 70, width - 60, 24, 2);
}

function getPublicMatchRefereeCrew(league, match) {
  return [
    ["ARBITRO CENTRAL", match.centralRefereeName || findPublicRefereeName(league, match.centralRefereeUserId)],
    ["ASISTENTE 1", match.assistantReferee1Name || findPublicRefereeName(league, match.assistantReferee1UserId)],
    ["ASISTENTE 2", match.assistantReferee2Name || findPublicRefereeName(league, match.assistantReferee2UserId)],
    ["CUARTO ARBITRO", match.fourthRefereeName || findPublicRefereeName(league, match.fourthRefereeUserId)]
  ].filter(([, name]) => Boolean(String(name || "").trim()));
}

function findPublicRefereeName(league, userId) {
  if (!userId) return "";
  return (league.referees || []).find((referee) => referee.userId === userId || referee.id === userId)?.name || "";
}

function drawActaRefereeCrew(context, crew, y, width) {
  drawRoundedRect(context, 78, y, width, 126, 18, "rgba(3, 18, 20, 0.78)");
  drawRoundedStroke(context, 78, y, width, 126, 18, "rgba(117, 240, 95, 0.24)", 1.6);
  const columnWidth = width / crew.length;
  crew.forEach(([role, name], index) => {
    const x = 78 + index * columnWidth + 26;
    if (index > 0) {
      context.strokeStyle = "rgba(236, 255, 246, 0.16)";
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(78 + index * columnWidth, y + 26);
      context.lineTo(78 + index * columnWidth, y + 100);
      context.stroke();
    }
    context.fillStyle = "#75f05f";
    context.font = "950 14px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    drawCanvasFittedText(context, role, x, y + 42, columnWidth - 52, 14, 10, 950);
    context.fillStyle = "#ffffff";
    context.font = "850 17px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    drawCanvasText(context, String(name).toLocaleUpperCase("es-MX"), x, y + 72, columnWidth - 52, 22, 2);
  });
}

function drawShareBackground(context, width, height) {
  context.fillStyle = "#f6faf7";
  context.fillRect(0, 0, width, height);

  const headerGradient = context.createLinearGradient(0, 0, width, 136);
  headerGradient.addColorStop(0, "#061d2f");
  headerGradient.addColorStop(0.48, "#0f6b4f");
  headerGradient.addColorStop(1, "#123f2d");
  context.fillStyle = headerGradient;
  context.fillRect(0, 0, width, 136);

  context.fillStyle = "rgba(255, 255, 255, 0.08)";
  context.beginPath();
  context.moveTo(width - 360, 0);
  context.lineTo(width - 245, 0);
  context.lineTo(width - 340, 136);
  context.lineTo(width - 455, 136);
  context.closePath();
  context.fill();

  context.fillStyle = "rgba(182, 227, 92, 0.28)";
  context.beginPath();
  context.arc(width - 80, 40, 180, 0, Math.PI * 2);
  context.fill();

  const glow = context.createLinearGradient(0, 126, width, 126);
  glow.addColorStop(0, "rgba(42, 231, 188, 0)");
  glow.addColorStop(0.55, "rgba(42, 231, 188, 0.42)");
  glow.addColorStop(1, "rgba(140, 247, 76, 0.12)");
  context.fillStyle = glow;
  context.fillRect(0, 128, width, 8);
}

async function drawShareHeader(context, width, { eyebrow, league, title }) {
  drawRoundedRect(context, 60, 32, 66, 66, 18, "rgba(255, 255, 255, 0.96)");
  drawRoundedStroke(context, 60, 32, 66, 66, 18, "rgba(140, 247, 76, 0.5)", 2);
  context.fillStyle = "#0f6b4f";
  context.font = "950 24px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  context.fillText(getTeamInitials(league.name), 78, 54);
  context.fillStyle = "#dff7e9";
  drawCanvasFittedText(context, String(eyebrow || "").toLocaleUpperCase("es-MX"), 142, 36, 576, 20, 15, 900);
  context.fillStyle = "#ffffff";
  drawCanvasFittedText(context, title, 142, 64, 590, 42, 30, 950);
  await drawLigatecCanvasBrand(context, width - 318, 28, 258, 78);
}

function getShareHeaderEyebrow(league, { competition = null, detail = "" } = {}) {
  const competitionName = getShareCompetitionName(league, competition);
  const normalizedDetail = String(detail || "").trim();
  return [competitionName, normalizedDetail].filter(Boolean).join(" | ");
}

function getShareCompetitionName(league, competition = null) {
  const selectedCompetition = competition || getCompetition(league, league.currentCompetitionId);
  if (selectedCompetition?.name) return selectedCompetition.name;
  if ((league.competitions || []).length > 1) return "Todos los torneos";
  return league.season || "Torneo";
}

function drawShareFooter(context, width, height, league) {
  context.fillStyle = "#718078";
  context.font = "850 21px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  const footer = `${league.name} | ${league.city || ""}`.toLocaleUpperCase("es-MX");
  drawCanvasFittedText(context, footer, 60, height - 52, width - 420, 21, 15, 900);
  context.fillStyle = "#0f6b4f";
  context.font = "900 18px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  context.fillText("LIGATEC · PLATAFORMA DEPORTIVA", width - 390, height - 52);
}

function drawTeamBubble(context, team, x, y, size) {
  context.fillStyle = team?.colors || "#0f6b4f";
  context.beginPath();
  context.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = "#ffffff";
  context.lineWidth = 3;
  context.stroke();
  context.fillStyle = "#ffffff";
  context.font = "950 13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  context.textAlign = "center";
  context.fillText(getTeamInitials(team?.name || "E"), x + size / 2, y + 10);
  context.textAlign = "left";
}

function drawShareLabel(context, text, x, y, color) {
  context.fillStyle = color;
  context.font = "950 18px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  context.fillText(text, x, y);
}

function drawShareStatCell(context, value, x, y) {
  context.font = "900 20px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  context.fillText(String(value ?? 0), x, y);
}

function drawShareEmptyState(context, text, x, y, width) {
  drawRoundedRect(context, x, y, width, 92, 18, "#ffffff");
  context.fillStyle = "#64736b";
  context.font = "900 24px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  drawCanvasText(context, text, x + 28, y + 30, width - 56, 28, 2);
}

function chunkShareRows(rows, size) {
  const chunks = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}

let ligatecCanvasLogoPromise = null;

function loadLigatecCanvasLogo() {
  if (!ligatecCanvasLogoPromise) {
    ligatecCanvasLogoPromise = new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = ligatecLogo;
    });
  }
  return ligatecCanvasLogoPromise;
}

async function drawLigatecCanvasBrand(context, x, y, width, height) {
  context.save();
  context.shadowColor = "rgba(0, 0, 0, 0.22)";
  context.shadowBlur = 18;
  context.shadowOffsetY = 8;
  drawRoundedRect(context, x, y, width, height, 22, "rgba(2, 18, 24, 0.52)");
  context.restore();

  drawRoundedStroke(context, x, y, width, height, 22, "rgba(255, 255, 255, 0.22)", 1.5);
  drawRoundedStroke(context, x + 2, y + 2, width - 4, height - 4, 19, "rgba(42, 231, 188, 0.18)", 1);

  const iconSize = height - 24;
  const iconX = x + 14;
  const iconY = y + 12;

  drawRoundedRect(context, iconX - 3, iconY - 3, iconSize + 6, iconSize + 6, 16, "rgba(255, 255, 255, 0.16)");
  drawRoundedStroke(context, iconX - 3, iconY - 3, iconSize + 6, iconSize + 6, 16, "rgba(140, 247, 76, 0.42)", 1.4);

  try {
    const image = await loadLigatecCanvasLogo();
    const ratio = Math.max(iconSize / image.width, iconSize / image.height);
    const drawWidth = image.width * ratio;
    const drawHeight = image.height * ratio;
    context.save();
    drawRoundedPath(context, iconX, iconY, iconSize, iconSize, 14);
    context.clip();
    context.drawImage(image, iconX + (iconSize - drawWidth) / 2, iconY + (iconSize - drawHeight) / 2, drawWidth, drawHeight);
    context.restore();
  } catch {
    context.fillStyle = "#ffffff";
    context.font = "950 20px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    context.fillText("L", iconX + 17, iconY + 14);
  }

  context.fillStyle = "#ffffff";
  context.font = "950 25px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  context.fillText("LIGATEC", x + 82, y + 17);
  context.fillStyle = "rgba(223, 247, 233, 0.78)";
  context.font = "850 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  context.fillText("PLATAFORMA DEPORTIVA", x + 84, y + 48);

  const accent = context.createLinearGradient(x + 82, y + 65, x + width - 20, y + 65);
  accent.addColorStop(0, "rgba(42, 231, 188, 0.95)");
  accent.addColorStop(1, "rgba(140, 247, 76, 0.9)");
  drawRoundedRect(context, x + 84, y + 62, width - 112, 4, 4, accent);
}

function drawRoundedPath(context, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
}

function drawRoundedRect(context, x, y, width, height, radius, color) {
  context.fillStyle = color;
  drawRoundedPath(context, x, y, width, height, radius);
  context.fill();
}

function drawRoundedStroke(context, x, y, width, height, radius, color, lineWidth = 1) {
  context.strokeStyle = color;
  context.lineWidth = lineWidth;
  drawRoundedPath(context, x, y, width, height, radius);
  context.stroke();
}

function drawCanvasText(context, text, x, y, maxWidth, lineHeight, maxLines = 2) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  let line = "";
  let currentY = y;
  let lines = 0;

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    if (context.measureText(testLine).width > maxWidth && line) {
      context.fillText(line, x, currentY);
      currentY += lineHeight;
      lines += 1;
      line = word;
      if (lines >= maxLines - 1) break;
    } else {
      line = testLine;
    }
  }

  if (line && lines < maxLines) {
    context.fillText(line, x, currentY);
  }
}

function drawCanvasFittedText(context, text, x, y, maxWidth, startSize, minSize, weight = 900) {
  const value = String(text || "");
  let size = startSize;
  do {
    context.font = `${weight} ${size}px system-ui, -apple-system, BlinkMacSystemFont, sans-serif`;
    if (context.measureText(value).width <= maxWidth || size <= minSize) break;
    size -= 1;
  } while (size >= minSize);
  context.fillText(value, x, y);
}

function getFeaturedPublicMatch(league, standings) {
  const scheduled = sortPublicMatchesByRound(league.matches.filter(isPublicPlayableScheduledMatch));
  if (scheduled.length) {
    const targetRound = getNextScheduledRound(scheduled);
    const roundMatches = scheduled.filter((match) => Number(match.round || 0) === targetRound);
    const candidates = roundMatches.length ? roundMatches : scheduled;

    return candidates
      .map((match) => ({ match, score: getFeaturedMatchScore(match, standings, league.rules) }))
      .sort((a, b) => b.score - a.score || comparePublicMatches(a.match, b.match))[0]?.match || scheduled[0];
  }

  return sortPublicMatches(finishedMatches(league)).reverse()[0] || null;
}

function getNextScheduledRound(matches) {
  const scheduledRounds = matches
    .map((match) => Number(match.round || 0))
    .filter(Boolean)
    .sort((a, b) => a - b);
  return scheduledRounds[0] || Number(matches[0]?.round || 0);
}

function sortPublicMatchesByRound(matches) {
  return [...matches].sort(comparePublicMatches);
}

function comparePublicMatches(a, b) {
  return (
    Number(a.round || 0) - Number(b.round || 0) ||
    String(a.date || "").localeCompare(String(b.date || "")) ||
    String(a.time || "").localeCompare(String(b.time || ""))
  );
}

function getFeaturedMatchScore(match, standings, rules) {
  const rowsByTeam = new Map(standings.map((row, index) => [row.team.id, { ...row, rank: index + 1 }]));
  const home = rowsByTeam.get(match.homeTeamId);
  const away = rowsByTeam.get(match.awayTeamId);
  if (!home || !away) return 0;

  const topCut = Math.min(6, standings.length);
  const playoffCut = Math.max(topCut, Number(rules?.playoffQualifiers ?? topCut));
  const rankGap = Math.abs(home.rank - away.rank);
  const pointGap = Math.abs(home.points - away.points);
  const averageRank = (home.rank + away.rank) / 2;
  const bestRank = Math.min(home.rank, away.rank);
  const worstRank = Math.max(home.rank, away.rank);
  const homeBubbleDistance = playoffCut ? Math.abs(home.rank - playoffCut) : 99;
  const awayBubbleDistance = playoffCut ? Math.abs(away.rank - playoffCut) : 99;
  const topSixDistance = Math.min(Math.abs(home.rank - topCut), Math.abs(away.rank - topCut));
  const closestBubble = Math.min(homeBubbleDistance, awayBubbleDistance);
  const bothTopSix = home.rank <= topCut && away.rank <= topCut;
  const topSixDirectFight = topCut
    ? ((home.rank <= topCut && away.rank > topCut) || (away.rank <= topCut && home.rank > topCut)) && worstRank <= topCut + 2
    : false;
  const isDirectBubbleFight = playoffCut
    ? ((home.rank <= playoffCut && away.rank > playoffCut) || (away.rank <= playoffCut && home.rank > playoffCut)) && rankGap <= 4
    : false;
  const leaderInvolved = home.rank === 1 || away.rank === 1;

  let score = 0;
  score += Math.max(0, 46 - averageRank * 3.2);
  score += Math.max(0, 30 - pointGap * 4);
  score += Math.max(0, 24 - rankGap * 3.2);
  score += Math.max(0, 16 - bestRank * 1.5);

  if (bestRank === 1 && worstRank <= 3) score += 80;
  if (bestRank <= 2 && worstRank <= 4) score += 54;
  if (home.rank <= 3 && away.rank <= 3) score += 46;
  if (bothTopSix) score += 34;
  if (home.rank <= 3 && away.rank <= 3 && pointGap <= 5) score += 24;
  if (topSixDirectFight) score += 26;
  if (worstRank >= 5 && worstRank <= 8 && bestRank <= topCut) score += 16;
  if (topSixDistance <= 1) score += 16;
  if (home.rank <= playoffCut && away.rank <= playoffCut) score += 8;
  if (closestBubble <= 2) score += 8;
  if (isDirectBubbleFight) score += 10;
  if (pointGap <= 3 && rankGap <= 4) score += 14;
  if (leaderInvolved && pointGap <= 4) score += 10;
  if (leaderInvolved && pointGap >= 8 && worstRank > topCut) score -= 16;
  if (pointGap >= 10 && rankGap >= 6) score -= 12;

  return score;
}

function HeroMatchPanel({ league, match, standings }) {
  const leaders = standings.slice(0, 3);
  if (!match) {
    return (
      <aside className="hero-match-panel">
        <span className="hero-match-label">Centro de jornada</span>
        <strong>Calendario por confirmar</strong>
        <p>Cuando se programe el torneo, aqui aparecera el partido principal de la jornada.</p>
        <HeroLeaders rows={leaders} />
      </aside>
    );
  }

  const home = getTeam(league, match.homeTeamId);
  const away = getTeam(league, match.awayTeamId);
  const isFinished = match.status === "finished" || match.status === "walkover";
  const headline = isFinished ? "Ultimo resultado" : "Destacado de la jornada";
  const score = isFinished ? `${match.homeGoals ?? 0} - ${match.awayGoals ?? 0}` : "VS";

  return (
    <aside className="hero-match-panel" aria-label={headline}>
      <div className="hero-match-topline">
        <span className="hero-match-label">{headline}</span>
        <span>{match.round ? `J${match.round}` : "Jornada"}</span>
      </div>
      <div className="hero-match-board">
        <HeroMatchTeam team={home} fallback="Local" />
        <div className="hero-match-score">
          <strong>{score}</strong>
          <span>{isFinished ? "Final" : match.time ? `${match.time} hrs` : "Hora por definir"}</span>
        </div>
        <HeroMatchTeam team={away} fallback="Visitante" />
      </div>
      <div className="hero-match-meta">
        <span>{match.date ? formatDate(match.date) : "Fecha por definir"}</span>
        <span>{match.venue || "Cancha por definir"}</span>
      </div>
      <button
        className="hero-share-button"
        type="button"
        onClick={() => shareFeaturedMatchCard({ league, match })}
      >
        Compartir partido
      </button>
      <HeroLeaders rows={leaders} />
    </aside>
  );
}

function HeroLeaders({ rows }) {
  if (!rows.length) return null;

  return (
    <div className="hero-leaders" aria-label="Primeros lugares de la tabla">
      <div className="hero-leaders-title">
        <span>Top tabla</span>
        <small>Primeros 3 lugares</small>
      </div>
      <div className="hero-leaders-list">
        {rows.map((row, index) => (
          <article className={`leader-rank-${index + 1}`} key={row.team.id}>
            <span>{index + 1}</span>
            <strong>{row.team.name}</strong>
            <small>{row.points} pts</small>
          </article>
        ))}
      </div>
    </div>
  );
}

function HeroMatchTeam({ team, fallback }) {
  return (
    <div className="hero-match-team">
      <TeamMark team={team} className="hero-match-crest" />
      <strong>{team?.name || fallback}</strong>
    </div>
  );
}

function PublicQuickNav({ activeView, onSelectView }) {
  return (
    <nav className="public-quick-nav" aria-label="Navegacion publica">
      {PUBLIC_APP_VIEWS.map((view) => {
        const isActive = activeView === view.id || (activeView === "partido" && view.id === "calendario");
        return (
          <button
            aria-current={isActive ? "page" : undefined}
            className={isActive ? "active" : ""}
            key={view.id}
            type="button"
            onClick={() => onSelectView(view.id)}
          >
            <span className="quick-nav-icon" aria-hidden="true"><PublicNavIcon type={view.icon} /></span>
            <span>{view.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function PublicNavIcon({ type }) {
  if (type === "home") {
    return (
      <svg viewBox="0 0 24 24" role="img">
        <path d="M4 11.4 12 4l8 7.4" />
        <path d="M6.8 10.4V20h10.4v-9.6" />
        <path d="M9.8 20v-5.2h4.4V20" />
      </svg>
    );
  }

  if (type === "matches") {
    return (
      <svg viewBox="0 0 24 24" role="img">
        <path d="M6.5 4.8v2.8M17.5 4.8v2.8" />
        <path d="M5 7h14v12H5z" />
        <path d="M5 10.2h14" />
        <path d="M8.2 14.8h7.6" />
        <path d="m13.8 12.9 2 1.9-2 1.9" />
      </svg>
    );
  }

  if (type === "table") {
    return (
      <svg viewBox="0 0 24 24" role="img">
        <path d="M5 5h14v14H5z" />
        <path d="M5 10h14M5 14.5h14M9.8 5v14" />
        <path d="M12.5 7.5h3.8M12.5 12.2h2.6M12.5 16.8h4.2" />
      </svg>
    );
  }

  if (type === "scoring") {
    return (
      <svg viewBox="0 0 24 24" role="img">
        <circle cx="10.2" cy="13.8" r="5.6" />
        <path d="m7.4 13.2 2.1-1.6 2.4 1.2-.5 2.7H8.8z" />
        <path d="M10.2 8.2v3.4M5.2 12.1l2.2 1.1M13.7 9.9l-1.8 2.9M6.6 17.2l2.2-1.7M14.6 15.8l-3.2-.3" />
        <path d="M16 5h3v14h-3" />
        <path d="M16 8.2h2.7M16 12h2.7M16 15.8h2.7" />
      </svg>
    );
  }

  if (type === "team") {
    return (
      <svg viewBox="0 0 24 24" role="img">
        <path d="M8.2 10.6a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
        <path d="M15.8 10.6a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
        <path d="M4.6 19.3v-1.4c0-2.6 1.9-4.7 4.1-4.7h1.1c2.2 0 4.1 2.1 4.1 4.7v1.4" />
        <path d="M12.4 13.3c.5-.1 1-.1 1.6-.1h1.1c2.2 0 4.1 2.1 4.1 4.7v1.4" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" role="img">
      <path d="M6 8h12M6 12h12M6 16h12" />
      <path d="M4 8h.1M4 12h.1M4 16h.1" />
    </svg>
  );
}

function PublicUtilityBar({ leagueName, onSearch, onSelectResult, onShare, query, results, searchInputRef }) {
  return (
    <section className="public-utility-bar" aria-label="Herramientas publicas">
      <label className={`public-search-box ${query ? "has-value" : ""}`}>
        <span>Buscar dentro de la liga</span>
        <input
          ref={searchInputRef}
          type="search"
          value={query}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Equipo, jugador o partido..."
          autoCapitalize="none"
          autoComplete="off"
          spellCheck="false"
        />
        {query && (
          <button
            className="search-clear-button"
            type="button"
            aria-label="Limpiar busqueda"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSearch("")}
          >
            X
          </button>
        )}
      </label>
      <ShareActionButton className="public-share-button" label="Compartir liga" onClick={onShare} />
      {query.trim().length >= 2 && (
        <div className="public-search-results">
          {results.map((result) => (
            <a
              href={result.href}
              key={`${result.type}-${result.id}`}
              onClick={(event) => {
                event.preventDefault();
                onSelectResult(result);
              }}
            >
              <small>{getPublicSearchTypeLabel(result.type)}</small>
              <strong>{result.name}</strong>
              <span>{result.detail}</span>
              {result.competitionId && !result.isCurrentCompetition && <em>Ver en su torneo</em>}
            </a>
          ))}
          {!results.length && <p>Sin resultados para {leagueName}.</p>}
        </div>
      )}
    </section>
  );
}

function getPublicSearchTypeLabel(type) {
  if (type === "team") return "Equipo";
  if (type === "player") return "Jugador";
  if (type === "match") return "Partido";
  return "Resultado";
}

function ShareActionButton({ className = "", label, onClick }) {
  const [isSharing, setIsSharing] = useState(false);

  async function handleShareClick() {
    if (isSharing) return;
    setIsSharing(true);
    try {
      await onClick?.();
    } finally {
      setIsSharing(false);
    }
  }

  return (
    <button
      aria-busy={isSharing}
      className={`whatsapp-share-button ${isSharing ? "is-loading" : ""} ${className}`.trim()}
      disabled={isSharing}
      type="button"
      onClick={handleShareClick}
    >
      <span className="whatsapp-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <path d="M8.7 10.8 15.3 7M8.7 13.2l6.6 3.8" />
        </svg>
      </span>
      {isSharing ? "Generando imagen..." : label}
    </button>
  );
}

function PublicHomeDashboard({
  activeCompetition,
  announcements = [],
  heroImage,
  league,
  latestResults,
  nextMatches,
  standings,
  currentRound,
  stats,
  scorers = [],
  media = [],
  onGoHome,
  onLogin,
  onOpenSearch,
  onOpenTournament,
  onSelectView
}) {
  const finishedCount = finishedMatches(league).length;
  const programmedCount = league.matches.filter(isPublicScheduledMatch).length;
  const leader = standings[0];
  const topScorer = [...stats].sort((a, b) => b.goals - a.goals || a.player.name.localeCompare(b.player.name))[0];
  const bestOffense = [...standings].sort((a, b) => b.goalsFor - a.goalsFor || a.team.name.localeCompare(b.team.name))[0];
  const bestDefense = [...standings].sort((a, b) => a.goalsAgainst - b.goalsAgainst || a.team.name.localeCompare(b.team.name))[0];
  const heroMedia = getPublicHomeMedia(media, "hero")[0];
  const momentMedia = getPublicHomeMedia(media, "moment")[0] || getPublicHomeMedia(media, "gallery")[0];
  const galleryMedia = getPublicHomeMedia(media, "gallery").slice(0, 6);
  const featuredMatch = nextMatches[0] || latestResults[0] || league.matches[0];
  const featuredHome = featuredMatch ? getTeam(league, featuredMatch.homeTeamId) : null;
  const featuredAway = featuredMatch ? getTeam(league, featuredMatch.awayTeamId) : null;
  const activeAnnouncement = announcements[0];
  const totalGoals = finishedMatches(league).reduce((sum, match) => sum + Number(match.homeGoals || 0) + Number(match.awayGoals || 0), 0);
  const matchEvents = league.matches.flatMap((match) => match.events || []);
  const capturedEvents = matchEvents.length ? matchEvents : (league.events || []);
  const cards = capturedEvents.reduce((summary, event) => {
    if (event.type === "yellow" && isAccumulatingYellowCard(event)) summary.yellow += 1;
    if (event.type === "red") summary.red += 1;
    return summary;
  }, { yellow: 0, red: 0 });
  const averageGoals = finishedCount ? (totalGoals / finishedCount).toFixed(2) : "0.00";
  const leagueLogoUrl = league.identity?.logoUrl || league.logoUrl || "";
  const activeSponsors = getActivePublicSponsors(league);
  const competitionName = activeCompetition?.name || league.name;
  const seasonName = activeCompetition?.season || league.season || "Temporada activa";
  const currentRoundLabel = currentRound || featuredMatch?.round || activeCompetition?.activeRound || "-";
  const [isHomeChromeHidden, setHomeChromeHidden] = useState(false);
  const lastHomeScrollYRef = useRef(0);
  const lastHomeTouchYRef = useRef(0);
  const homeChromeHiddenRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const setChromeHidden = (hidden) => {
      homeChromeHiddenRef.current = hidden;
      setHomeChromeHidden(hidden);
      document.body.classList.toggle("ligatec-home-chrome-hidden", hidden);
    };
    const getCurrentScrollY = () => {
      const scrollValues = [
        window.scrollY || 0,
        document.documentElement?.scrollTop || 0,
        document.body?.scrollTop || 0
      ];
      document
        .querySelectorAll(".page, .public-league-page, .public-app-workspace, .public-home-dashboard")
        .forEach((element) => {
          scrollValues.push(element.scrollTop || 0);
        });
      return Math.max(...scrollValues);
    };
    lastHomeScrollYRef.current = getCurrentScrollY();
    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        const currentScrollY = getCurrentScrollY();
        const previousScrollY = lastHomeScrollYRef.current;
        if (currentScrollY <= 18) {
          setChromeHidden(false);
        } else if (currentScrollY > previousScrollY + 6) {
          setChromeHidden(true);
        } else if (currentScrollY < previousScrollY - 2) {
          setChromeHidden(false);
        }
        lastHomeScrollYRef.current = currentScrollY;
        ticking = false;
      });
    };
    const handleWheel = (event) => {
      if (event.deltaY > 5 && !homeChromeHiddenRef.current) setChromeHidden(true);
      if (event.deltaY < -5 && homeChromeHiddenRef.current) setChromeHidden(false);
    };
    const handleTouchStart = (event) => {
      lastHomeTouchYRef.current = event.touches?.[0]?.clientY || 0;
    };
    const handleTouchMove = (event) => {
      const currentTouchY = event.touches?.[0]?.clientY || 0;
      const delta = currentTouchY - lastHomeTouchYRef.current;
      if (Math.abs(delta) < 5) return;
      if (delta > 0) setChromeHidden(false);
      if (delta < 0 && getCurrentScrollY() > 18) setChromeHidden(true);
      lastHomeTouchYRef.current = currentTouchY;
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("wheel", handleWheel, { passive: true });
    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    document.addEventListener("scroll", handleScroll, { passive: true, capture: true });
    return () => {
      document.body.classList.remove("ligatec-home-chrome-hidden");
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("wheel", handleWheel);
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("scroll", handleScroll, true);
    };
  }, []);

  return (
    <section className="public-home-dashboard" aria-label="Inicio de liga">
      <div className="home-app-shell">
        <div className={`home-sticky-chrome${isHomeChromeHidden ? " is-hidden" : ""}`}>
          <div className="home-app-header">
            <div className="home-brand-lockup">
              <img src={ligatecLogo} alt="Ligatec" />
              <div>
                <strong>LIGATEC</strong>
                <small>PLATAFORMA DEPORTIVA</small>
              </div>
            </div>
            <button className="home-login-button" type="button" onClick={onLogin}>
              <span className="access-link-mark" aria-hidden="true" />
              <strong>LOGIN</strong>
            </button>
          </div>

          <nav className="home-primary-tabs" aria-label="Navegacion principal de inicio">
            <button className="active" type="button" onClick={onGoHome || (() => onSelectView("inicio"))}>Inicio</button>
            <button type="button" onClick={onOpenTournament}>Cambiar torneo</button>
            <button className="home-tab-search" type="button" aria-label="Buscar equipo o jugador" onClick={onOpenSearch}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m21 21-4.4-4.4" />
                <circle cx="11" cy="11" r="7" />
              </svg>
            </button>
          </nav>
        </div>

        <HomeFeaturedMatch
          competitionName={competitionName}
          currentRound={currentRoundLabel}
          heroImage={stadiumHero || heroMedia?.imageUrl || heroImage}
          league={league}
          leagueLogoUrl={leagueLogoUrl}
          match={featuredMatch}
          seasonName={seasonName}
          home={featuredHome}
          away={featuredAway}
          onOpen={() => onSelectView("calendario", { round: featuredMatch?.round || currentRoundLabel })}
        />

        {activeAnnouncement && (
          <article className="home-announcement-card">
            <span>Aviso de la liga</span>
            <strong>{activeAnnouncement.title}</strong>
            <p>{activeAnnouncement.body}</p>
            <button type="button" onClick={() => onSelectView("mas")}>Ver mas</button>
          </article>
        )}

        <section className="home-week-highlights" aria-label="Destacados de la semana">
          <div className="home-section-head">
            <h2>Destacados de la semana</h2>
            <button type="button" onClick={() => onSelectView("tabla", { statsPanel: "goleo" })}>Ver goleo</button>
          </div>
          <div className="home-highlight-strip">
            <HomeHighlightCard title="Lider" value={leader?.team?.name || "Por definir"} detail={leader ? `${leader.points} pts` : "Sin tabla"} team={leader?.team} />
            <HomeHighlightCard title="Goleador" value={topScorer?.player?.name || "Por definir"} detail={topScorer?.goals ? `${topScorer.goals} goles` : "Sin goles"} team={topScorer?.team} />
            <HomeHighlightCard title="Ofensiva" value={bestOffense?.team?.name || "Por definir"} detail={bestOffense ? `${bestOffense.goalsFor} goles` : "Sin datos"} team={bestOffense?.team} />
            <HomeHighlightCard title="Defensa" value={bestDefense?.team?.name || "Por definir"} detail={bestDefense ? `${bestDefense.goalsAgainst} GC` : "Sin datos"} team={bestDefense?.team} />
          </div>
        </section>

        <HomeTopScorersPoster
          competitionName={competitionName}
          rows={scorers.slice(0, 5)}
        />

        <HomeMomentCard imageUrl={momentMedia?.imageUrl || heroMedia?.imageUrl || heroImage} media={momentMedia} />

        <section className="home-gallery-panel">
          <div className="home-section-head">
            <h2>Fotos de la liga</h2>
            <button type="button" onClick={() => onSelectView("fotos")}>Ver mas</button>
          </div>
          <div className="home-gallery-grid">
            {(galleryMedia.length ? galleryMedia : [{ id: "fallback", imageUrl: stadiumHero || heroMedia?.imageUrl || heroImage, title: competitionName || league.name, caption: "La galeria del torneo aparecera aqui cuando subas fotos desde el panel admin." }]).map((item) => (
              <figure key={item.id}>
                <LoadableImage src={item.imageUrl} alt="" />
                <figcaption>
                  <strong>{item.title || "Momento de la liga"}</strong>
                  {item.caption && <small>{item.caption}</small>}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section className="home-next-panel">
          <div className="home-section-head">
            <h2>Proximos partidos</h2>
            <button type="button" onClick={() => onSelectView("calendario")}>Ver calendario</button>
          </div>
          <div className="home-next-list">
            {nextMatches.slice(0, 3).map((match) => (
              <MiniMatchRow key={match.id} league={league} match={match} onOpenMatches={() => onSelectView("calendario")} />
            ))}
            {!nextMatches.length && <p className="empty empty-polished">Aun no hay partidos programados.</p>}
          </div>
        </section>

        <section className="home-standings-preview">
          <div className="home-section-head">
            <h2>Tabla de posiciones</h2>
            <button type="button" onClick={() => onSelectView("tabla")}>Ver tabla completa</button>
          </div>
          <div className="home-standings-list">
            {standings.slice(0, 5).map((row, index) => (
              <article key={row.team.id}>
                <span>{index + 1}</span>
                <TeamMark team={row.team} className="home-table-crest" />
                <strong>{row.team.name}</strong>
                <small>{row.played} PJ</small>
                <em>{row.points}</em>
              </article>
            ))}
          </div>
        </section>

        <section className="home-tournament-summary" aria-label="Resumen del torneo">
          <div className="home-section-head">
            <h2>Resumen del torneo</h2>
          </div>
          <div className="home-stat-grid">
            <HomeMetric value={league.teams.length} label="Equipos" tone="teams" />
            <HomeMetric value={finishedCount} label="Partidos jugados" tone="matches" />
            <HomeMetric value={totalGoals} label="Goles anotados" tone="goals" />
            <HomeMetric value={averageGoals} label="Goles por partido" tone="average" />
            <HomeMetric value={cards.yellow} label="Amarillas" tone="yellow" />
            <HomeMetric value={cards.red} label="Rojas" tone="red" />
          </div>
        </section>

        <section className="home-sponsors-panel">
          <div className="home-section-head">
            <div>
              <span>Aliados del torneo</span>
              <h2>Patrocinadores oficiales</h2>
            </div>
            <small>{activeSponsors.length || 0}</small>
          </div>
          <HomeSponsorShowcase sponsors={activeSponsors} fallback="Patrocina la portada de tu liga" />
          <SponsorContactCard league={league} />
        </section>
      </div>
    </section>
  );
}

function getActivePublicSponsors(league) {
  if (isSponsorDemoEnabled()) return DEMO_HOME_SPONSORS;
  return [...(league.sponsors || [])]
    .filter((sponsor) => (sponsor.status || "active") === "active" && sponsor.imageUrl)
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || a.name.localeCompare(b.name));
}

function isSponsorDemoEnabled() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("sponsorDemo") === "1";
}

function sponsorLogoDataUrl({ name, bg, fg = "#ffffff", accent = "#1597ff", label = "" }) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="720" height="360" viewBox="0 0 720 360">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="${bg}" />
          <stop offset="100%" stop-color="#06111f" />
        </linearGradient>
        <radialGradient id="glow" cx="78%" cy="18%" r="65%">
          <stop offset="0%" stop-color="${accent}" stop-opacity="0.42" />
          <stop offset="100%" stop-color="${accent}" stop-opacity="0" />
        </radialGradient>
      </defs>
      <rect width="720" height="360" rx="46" fill="url(#bg)" />
      <rect width="720" height="360" rx="46" fill="url(#glow)" />
      <circle cx="96" cy="96" r="48" fill="${accent}" opacity="0.9" />
      <text x="96" y="112" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="38" font-weight="900" fill="${fg}">${name.slice(0, 1)}</text>
      <text x="360" y="192" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="64" font-weight="900" fill="${fg}" letter-spacing="1">${name}</text>
      <text x="360" y="242" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="800" fill="${fg}" opacity="0.62" letter-spacing="5">${label || "PATROCINADOR"}</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

const DEMO_HOME_SPONSORS = [
  { id: "demo-coca-cola", name: "Coca-Cola", status: "active", sortOrder: 1, featured: true, imageUrl: sponsorLogoDataUrl({ name: "Coca-Cola", bg: "#b40018", accent: "#ff3b4e", label: "BEBIDAS" }) },
  { id: "demo-corona", name: "Corona", status: "active", sortOrder: 2, featured: true, imageUrl: sponsorLogoDataUrl({ name: "Corona", bg: "#f5f0dd", fg: "#10234a", accent: "#d4af37", label: "CERVEZA" }) },
  { id: "demo-powerade", name: "Powerade", status: "active", sortOrder: 3, featured: true, imageUrl: sponsorLogoDataUrl({ name: "Powerade", bg: "#07111c", accent: "#25a8ff", label: "HIDRATACION" }) },
  { id: "demo-gatorade", name: "Gatorade", status: "active", sortOrder: 4, imageUrl: sponsorLogoDataUrl({ name: "Gatorade", bg: "#111111", accent: "#ff7a00", label: "SPORTS" }) },
  { id: "demo-nissan", name: "Nissan", status: "active", sortOrder: 5, imageUrl: sponsorLogoDataUrl({ name: "Nissan", bg: "#2f3640", accent: "#bfc7d5", label: "AUTOS" }) },
  { id: "demo-puma", name: "Puma", status: "active", sortOrder: 6, imageUrl: sponsorLogoDataUrl({ name: "Puma", bg: "#050505", accent: "#ffffff", label: "SPORT" }) },
  { id: "demo-caliente", name: "Caliente.mx", status: "active", sortOrder: 7, imageUrl: sponsorLogoDataUrl({ name: "Caliente.mx", bg: "#d9242e", accent: "#ffe259", label: "ENTRETENIMIENTO" }) },
  { id: "demo-oxxo", name: "OXXO", status: "active", sortOrder: 8, imageUrl: sponsorLogoDataUrl({ name: "OXXO", bg: "#d71920", accent: "#ffd400", label: "TIENDA" }) },
  { id: "demo-telcel", name: "Telcel", status: "active", sortOrder: 9, imageUrl: sponsorLogoDataUrl({ name: "Telcel", bg: "#0b3f91", accent: "#3eb4ff", label: "TELECOM" }) },
  { id: "demo-bbva", name: "BBVA", status: "active", sortOrder: 10, imageUrl: sponsorLogoDataUrl({ name: "BBVA", bg: "#001f5b", accent: "#49a5ff", label: "BANCO" }) }
];

function HomeSponsorShowcase({ sponsors, fallback }) {
  if (!sponsors.length) {
    return (
      <div className="home-sponsor-empty">
        <span aria-hidden="true">★</span>
        <strong>{fallback || "Espacio disponible para tu marca"}</strong>
        <small>Tu negocio puede aparecer en la portada del torneo.</small>
      </div>
    );
  }

  const featured = sponsors.filter((sponsor) => sponsor.featured || sponsor.placement === "home_featured").slice(0, 3);
  const featuredSponsors = featured.length ? featured : sponsors.slice(0, Math.min(3, sponsors.length));
  const [primary, ...secondaryFeatured] = featuredSponsors;
  const rest = sponsors.filter((sponsor) => !featuredSponsors.some((featuredSponsor) => featuredSponsor.id === sponsor.id));

  function renderSponsorLogo(sponsor, options = {}) {
    return (
      <>
        <div className="home-sponsor-logo-frame">
          <LoadableImage alt={sponsor.name} src={sponsor.imageUrl} />
        </div>
        {options.primary ? (
          <span>
            <small>Patrocinador destacado</small>
            <strong>{sponsor.name}</strong>
          </span>
        ) : (
          <strong>{sponsor.name}</strong>
        )}
      </>
    );
  }

  function renderSponsorLink(sponsor, className, content) {
    return sponsor.linkUrl ? (
      <a className={className} href={sponsor.linkUrl} key={sponsor.id} rel="noreferrer" target="_blank">{content}</a>
    ) : (
      <article className={className} key={sponsor.id}>{content}</article>
    );
  }

  return (
    <div className="home-sponsor-showcase">
      {renderSponsorLink(primary, "home-sponsor-primary", renderSponsorLogo(primary, { primary: true }))}
      {!!secondaryFeatured.length && (
        <div className="home-sponsor-featured-row">
          {secondaryFeatured.map((sponsor) => renderSponsorLink(sponsor, "home-sponsor-featured-card", renderSponsorLogo(sponsor)))}
        </div>
      )}
      {!!rest.length && (
        <div className="home-sponsor-carousel" aria-label="Mas patrocinadores">
          <div className="home-sponsor-grid">
            {rest.slice(0, 12).map((sponsor) => {
              return renderSponsorLink(sponsor, "", renderSponsorLogo(sponsor));
            })}
          </div>
          <span className="home-sponsor-scroll-hint" aria-hidden="true">Desliza para ver mas</span>
        </div>
      )}
    </div>
  );
}

function SponsorContactCard({ league }) {
  const identity = league.identity || {};
  const isDemo = isSponsorDemoEnabled();
  const configuredWhatsapp = identity.sponsorContactEnabled ? identity.sponsorContactWhatsapp : "";
  const whatsappNumber = normalizeWhatsappNumber(configuredWhatsapp || (isDemo ? "521234567890" : "523541073146"));
  if (!whatsappNumber) return null;

  const message = identity.sponsorContactMessage || `Hola, quiero informacion para anunciar mi marca en ${league.name}.`;
  const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
  const contactName = identity.sponsorContactEnabled && identity.sponsorContactName
    ? identity.sponsorContactName
    : isDemo
      ? "Contacto demo"
      : "LIGATEC Comercial";

  return (
    <article className="home-sponsor-contact-card">
      <span className="sponsor-whatsapp-mark" aria-hidden="true">
        <svg viewBox="0 0 48 48">
          <path d="M24 5.5c-9.8 0-17.7 7.7-17.7 17.2 0 3.3 1 6.4 2.7 9.1L6.6 42.5l11-2.8c2 .8 4.2 1.3 6.4 1.3 9.8 0 17.7-7.7 17.7-17.2S33.8 5.5 24 5.5Z" />
          <path d="M17.4 14.9c-.4 0-1 .1-1.4.7-.5.6-1.8 1.8-1.8 4.3s1.8 5 2.1 5.3c.3.4 3.6 5.8 8.9 7.9 4.4 1.8 5.3 1.4 6.3 1.3 1-.1 3.1-1.2 3.5-2.4.4-1.2.4-2.2.3-2.4-.2-.2-.5-.4-1.1-.7l-3.6-1.7c-.5-.2-.9-.3-1.3.3-.4.6-1.5 1.8-1.8 2.2-.3.4-.7.4-1.2.1-.5-.3-2.3-.8-4.3-2.6-1.6-1.4-2.7-3.1-3-3.7-.3-.5 0-.8.2-1.1.3-.3.5-.7.8-1 .3-.3.4-.6.6-1 .2-.4.1-.7 0-1l-1.6-3.8c-.4-.9-.8-.8-1.2-.8h-1Z" />
        </svg>
        <b>WA</b>
      </span>
      <div>
        <small>{contactName}</small>
        <strong>Quieres ser patrocinador?</strong>
        <p>Lleva tu marca a jugadores, equipos y aficion desde la portada del torneo.</p>
        <span className="sponsor-contact-benefits" aria-label="Beneficios comerciales">
          <em>
            <svg viewBox="0 0 24 24"><path d="M12 3l2.8 5.6 6.2.9-4.5 4.4 1.1 6.1-5.6-2.9L6.4 20l1.1-6.1L3 9.5l6.2-.9Z" /></svg>
            Portada
          </em>
          <em>
            <svg viewBox="0 0 24 24"><path d="M16 11a4 4 0 1 0-8 0" /><path d="M4 20a8 8 0 0 1 16 0" /><path d="M19 8a3 3 0 0 1 3 3" /><path d="M2 11a3 3 0 0 1 3-3" /></svg>
            Equipos
          </em>
          <em>
            <svg viewBox="0 0 24 24"><path d="M20.8 5.6a5.4 5.4 0 0 0-7.6 0L12 6.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 22l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z" /></svg>
            Aficion
          </em>
        </span>
      </div>
      <a href={whatsappUrl} rel="noreferrer" target="_blank">Contactar por WhatsApp</a>
    </article>
  );
}

function normalizeWhatsappNumber(value) {
  const clean = String(value || "").replace(/[^\d]/g, "");
  if (!clean) return "";
  if (clean.length === 10) return `52${clean}`;
  return clean;
}

function HomeMetric({ value, label, tone }) {
  const metricTone = tone || normalizeSearchTerm(label).replace(/[^a-z0-9]+/g, "-") || "default";
  return (
    <article className={`home-metric-card is-${metricTone}`}>
      <strong>{value}</strong>
      <span>{label}</span>
      <HomeMetricSparkline type={metricTone} />
      <HomeMetricIcon type={metricTone} />
    </article>
  );
}

function HomeMetricSparkline({ type }) {
  const paths = {
    teams: "M4 34 L22 34 L30 29 L38 34 L56 34 L64 26 L76 34 L92 34",
    matches: "M4 34 L18 34 L28 31 L40 34 L52 28 L66 30 L78 20 L92 13",
    goals: "M4 34 L16 34 L28 33 L39 34 L50 31 L62 34 L72 25 L84 32 L92 28",
    average: "M4 36 L18 27 L30 19 L42 23 L54 16 L66 20 L78 11 L92 5",
    yellow: "M4 35 L20 35 L32 34 L44 32 L56 34 L68 30 L78 18 L92 34",
    red: "M4 35 L18 35 L30 34 L42 36 L54 32 L66 35 L76 22 L92 34"
  };
  const path = paths[type] || paths.teams;
  const areaPath = `${path} L92 42 L4 42 Z`;

  return (
    <svg className="home-metric-sparkline" viewBox="0 0 96 44" preserveAspectRatio="none" aria-hidden="true">
      <path className="metric-spark-area" d={areaPath} />
      <path className="metric-spark-baseline" d="M4 36 H92" />
      <path className="metric-spark-line" d={path} />
      <circle className="metric-spark-dot dot-a" cx="30" cy={type === "average" ? "19" : type === "yellow" ? "34" : "31"} r="2.2" />
      <circle className="metric-spark-dot dot-b" cx="64" cy={type === "teams" ? "26" : type === "matches" ? "30" : type === "red" ? "35" : "30"} r="2.2" />
      <circle className="metric-spark-dot dot-c" cx="92" cy={type === "matches" ? "13" : type === "average" ? "5" : type === "yellow" ? "34" : "28"} r="2.6" />
    </svg>
  );
}

function HomeMetricIcon({ type }) {
  const commonProps = {
    className: "home-metric-icon",
    viewBox: "0 0 96 96",
    fill: "none",
    "aria-hidden": "true"
  };

  if (type === "teams") {
    return (
      <svg {...commonProps}>
        <path className="metric-glow" d="M48 8 80 22v25c0 19-13 32-32 41-19-9-32-22-32-41V22L48 8Z" />
        <path d="M48 10 78 23v23c0 18-12 30-30 39-18-9-30-21-30-39V23L48 10Z" />
        <circle cx="48" cy="36" r="10" />
        <circle cx="30" cy="42" r="7" />
        <circle cx="66" cy="42" r="7" />
        <path d="M30 64c2-10 10-16 18-16s16 6 18 16" />
        <path d="M17 66c2-8 8-13 15-13" />
        <path d="M79 66c-2-8-8-13-15-13" />
      </svg>
    );
  }

  if (type === "matches") {
    return (
      <svg {...commonProps}>
        <circle className="metric-glow" cx="48" cy="48" r="32" />
        <circle cx="48" cy="48" r="30" />
        <path d="m48 20 17 12-7 20H38l-7-20 17-12Z" />
        <path d="m31 32-12 15 10 21 20 8 20-8 10-21-12-15" />
        <path d="m38 52-9 16" />
        <path d="m58 52 9 16" />
        <path d="M38 52 24 45" />
        <path d="m58 52 14-7" />
      </svg>
    );
  }

  if (type === "goals") {
    return (
      <svg {...commonProps}>
        <path className="metric-glow" d="M12 72V28c0-8 6-14 14-14h44c8 0 14 6 14 14v44" />
        <path d="M14 74V28c0-7 5-12 12-12h44c7 0 12 5 12 12v46" />
        <path d="M24 72V30h48v42" />
        <path d="M24 42h48M24 54h48M36 30v42M48 30v42M60 30v42" />
        <circle cx="64" cy="65" r="12" />
        <path d="m64 53 7 5-3 8h-8l-3-8 7-5Z" />
      </svg>
    );
  }

  if (type === "average") {
    return (
      <svg {...commonProps}>
        <path className="metric-glow" d="M18 76h62" />
        <path d="M18 76h62M18 76V18" />
        <path d="m26 66 14-18 13 9 20-27" />
        <circle cx="26" cy="66" r="4" />
        <circle cx="40" cy="48" r="4" />
        <circle cx="53" cy="57" r="4" />
        <circle cx="73" cy="30" r="5" />
      </svg>
    );
  }

  if (type === "yellow" || type === "red") {
    return (
      <svg {...commonProps}>
        <rect className="metric-glow" x="33" y="17" width="31" height="58" rx="6" transform="rotate(-7 48.5 46)" />
        <rect x="35" y="18" width="28" height="56" rx="5" transform="rotate(-7 49 46)" />
      </svg>
    );
  }

  return (
    <svg {...commonProps}>
      <circle cx="48" cy="48" r="30" />
      <path d="M32 50h32M48 34v32" />
    </svg>
  );
}

function LegalFooterIcon({ type }) {
  const commonProps = {
    className: "public-legal-link-icon",
    viewBox: "0 0 24 24",
    fill: "none",
    "aria-hidden": "true"
  };

  if (type === "privacy") {
    return (
      <svg {...commonProps}>
        <path d="M12 3 20 6v6c0 5-3.2 8-8 10-4.8-2-8-5-8-10V6l8-3Z" />
        <path d="m8.8 12 2.2 2.2 4.5-5" />
      </svg>
    );
  }

  if (type === "terms") {
    return (
      <svg {...commonProps}>
        <path d="M7 3h7l4 4v14H7V3Z" />
        <path d="M14 3v5h4" />
        <path d="M9.5 12h5M9.5 16h5" />
      </svg>
    );
  }

  if (type === "copyright") {
    return (
      <svg {...commonProps}>
        <circle cx="12" cy="12" r="8" />
        <path d="M14.7 9.7A3.8 3.8 0 1 0 14.7 14.3" />
      </svg>
    );
  }

  return (
    <svg {...commonProps}>
      <path d="M4 6h16v12H4V6Z" />
      <path d="m5 7 7 6 7-6" />
    </svg>
  );
}

function getPublicHomeMedia(media, type) {
  return media
    .filter((item) => item.status !== "archived" && item.type === type && item.imageUrl)
    .sort((a, b) => (
      Number(a.sortOrder || 0) - Number(b.sortOrder || 0) ||
      String(b.date || "").localeCompare(String(a.date || ""))
    ));
}

function HomeFeaturedMatch({ competitionName, currentRound, heroImage, league, leagueLogoUrl, match, seasonName, home, away, onOpen }) {
  if (!match) {
    return (
      <article className="home-featured-match is-empty" style={{ "--home-photo": `url(${heroImage})` }}>
        <span>Calendario pendiente</span>
        <strong>La portada del proximo partido aparecera aqui.</strong>
      </article>
    );
  }
  const isFinished = match.status === "finished" || match.status === "walkover";
  const displayDate = match.date ? formatDate(match.date) : "Fecha por definir";
  const displayTime = match.time || "Hora por definir";
  const displayVenue = match.venue || "Cancha por definir";
  return (
    <article className="home-featured-match" style={{ "--home-photo": `url(${heroImage})` }}>
      <header className="home-featured-identity">
        <span className="home-league-mark" aria-hidden="true">
          {leagueLogoUrl ? <img alt="" src={leagueLogoUrl} loading="lazy" /> : getTeamInitials(league.name)}
        </span>
        <div>
          <small>{league.name}</small>
          <h1>{competitionName || league.name}</h1>
          <strong>{seasonName}</strong>
        </div>
      </header>
      <section className="home-match-showcard">
        <div className="home-featured-top">
          <span>{isFinished ? "Resultado reciente" : "Partido destacado"}</span>
          <strong>Jornada {match.round || currentRound || "-"}</strong>
        </div>
        <div className="home-featured-teams">
          <div>
            <TeamMark team={home} className="home-featured-crest" />
            <strong>{home?.name || "Local"}</strong>
          </div>
          <em>{isFinished ? `${match.homeGoals ?? 0}-${match.awayGoals ?? 0}` : "VS"}</em>
          <div>
            <TeamMark team={away} className="home-featured-crest" />
            <strong>{away?.name || "Visitante"}</strong>
          </div>
        </div>
        <div className="home-featured-meta">
          <span className="is-date">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 3.8v3M17 3.8v3" />
              <path d="M4.8 6.5h14.4v13H4.8z" />
              <path d="M4.8 10.2h14.4" />
              <path d="M8.1 14h3.2M8.1 16.8h5.8" />
            </svg>
            {displayDate}
          </span>
          <span className="is-time">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="8.2" />
              <path d="M12 7.6v4.8l3.2 1.9" />
            </svg>
            {displayTime}
          </span>
          <span className="is-venue">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 6.5h16v11H4z" />
              <path d="M12 6.5v11" />
              <circle cx="12" cy="12" r="2.2" />
              <path d="M4 9.2h3.2v5.6H4M20 9.2h-3.2v5.6H20" />
            </svg>
            {displayVenue}
          </span>
        </div>
        <button type="button" onClick={onOpen}>Ver mas partidos</button>
      </section>
    </article>
  );
}

function HomeHighlightCard({ title, value, detail, team }) {
  const tone = normalizeSearchTerm(title).replace(/[^a-z0-9]+/g, "-") || "default";
  return (
    <article className={`home-highlight-card is-${tone}`}>
      <span>{title}</span>
      <TeamMark team={team} className="home-highlight-crest" />
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function HomeTopScorersPoster({ competitionName, rows }) {
  if (!rows.length) {
    return (
      <section className="home-top-scorers-poster is-empty" aria-label="Top goleadores">
        <header>
          <span>Goleadores</span>
          <strong>Top 5</strong>
          <small>{competitionName}</small>
        </header>
        <p>Aún no hay goles registrados en este torneo.</p>
      </section>
    );
  }

  return (
    <section className="home-top-scorers-poster" aria-label="Top 5 goleadores">
      <header>
        <span>LIGATEC</span>
        <small>Goleadores</small>
        <strong>Top 5</strong>
        <em>{competitionName}</em>
      </header>
      <div className="home-top-scorer-list">
        {rows.map((row, index) => {
          const photoUrl = row.player?.photoAuthorized === true ? row.player?.photoUrl : "";
          return (
            <article className={`home-top-scorer rank-${index + 1}${photoUrl ? " has-photo" : " no-photo"}`} key={row.player.id}>
              <span className="home-top-rank">
                <strong>{index + 1}</strong>
                <small>Rank</small>
              </span>
              <span className={`home-top-player-photo-slot${photoUrl ? " has-photo" : " no-photo"}`}>
                {photoUrl && (
                  <LoadableImage
                    alt=""
                    className="home-top-player-photo"
                    src={photoUrl}
                  />
                )}
              </span>
              <span className="home-top-player-copy">
                <strong>{row.player.name}</strong>
                <small>{row.team?.name || "Sin equipo"}</small>
              </span>
              <span className="home-top-goals">
                <strong>{row.goals}</strong>
                <small aria-hidden="true">⚽</small>
                <em>{row.goals === 1 ? "gol" : "goles"}</em>
              </span>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function HomeMomentCard({ imageUrl, media }) {
  return (
    <article className="home-moment-card">
      <LoadableImage src={imageUrl} alt="" />
      <div>
        <span>Momento de la semana</span>
        <strong>{media?.title || "La liga en accion"}</strong>
        <p>{media?.caption || "Comparte fotos desde el panel admin para vestir esta portada con identidad propia."}</p>
      </div>
    </article>
  );
}

function MiniMatchRow({ league, match, onOpenMatches }) {
  const home = getTeam(league, match.homeTeamId);
  const away = getTeam(league, match.awayTeamId);
  const isFinished = match.status === "finished" || match.status === "walkover";
  const displayDate = match.date ? formatDate(match.date) : "Fecha por definir";
  const displayVenue = match.venue || "Cancha por definir";
  const homeName = home?.name || "LOCAL";
  const awayName = away?.name || "VISITANTE";
  const homeLongName = normalizeSearchTerm(homeName).length > 13;
  const awayLongName = normalizeSearchTerm(awayName).length > 13;
  const content = (
    <>
      <span className="mini-match-status-dot" aria-hidden="true" />
      <span className={`mini-match-team${homeLongName ? " has-long-name" : ""}`}>
        <TeamMark team={home} className="mini-match-crest" />
        <strong>{homeName}</strong>
      </span>
      <span className="mini-match-center">
        <b>{isFinished ? `${match.homeGoals ?? 0}-${match.awayGoals ?? 0}` : match.time || "VS"}</b>
        {!isFinished && <em>vs</em>}
      </span>
      <span className={`mini-match-team away${awayLongName ? " has-long-name" : ""}`}>
        <strong>{awayName}</strong>
        <TeamMark team={away} className="mini-match-crest" />
      </span>
      <small>
        <span>{displayDate}</span>
        <span>{displayVenue}</span>
      </small>
    </>
  );

  if (onOpenMatches) {
    return (
      <button className="mini-match-row" type="button" onClick={onOpenMatches}>
        {content}
      </button>
    );
  }

  return <div className="mini-match-row">{content}</div>;
}

function PublicPulseBar({ league, roundMatches, standings }) {
  const scheduledMatches = sortPublicMatches(league.matches.filter(isPublicScheduledMatch));
  const nextMatch = scheduledMatches[0] || null;
  const todayValue = getLocalDateValue(new Date());
  const todayMatches = scheduledMatches.filter((match) => match.date === todayValue);
  const roundPending = roundMatches.filter(isPublicScheduledMatch).length;
  const roundFinished = roundMatches.filter((match) => match.status === "finished" || match.status === "walkover").length;
  const leader = standings[0];

  return (
    <section className="public-pulse-bar" aria-label="Resumen rapido">
      <article className="pulse-feature">
        <span>{todayMatches.length ? "Hoy" : "Proximo"}</span>
        <strong>{nextMatch ? getMatchShortTitle(league, nextMatch) : "Calendario pendiente"}</strong>
        <small>{nextMatch ? getMatchShortMeta(nextMatch) : "Sin partidos programados"}</small>
      </article>
      <article>
        <span>Jornada</span>
        <strong>{roundPending} por jugar</strong>
        <small>{roundFinished} finalizado(s)</small>
      </article>
      <article>
        <span>Lider</span>
        <strong>{leader?.team.name || "Por definir"}</strong>
        <small>{leader ? `${leader.points} pts` : "Tabla pendiente"}</small>
      </article>
    </section>
  );
}

function getLocalDateValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getMatchShortTitle(league, match) {
  const home = getTeam(league, match.homeTeamId)?.name || "Local";
  const away = getTeam(league, match.awayTeamId)?.name || "Visitante";
  return `${home} vs ${away}`;
}

function getMatchShortMeta(match) {
  const date = match.date ? formatDate(match.date) : "Fecha por definir";
  const time = match.time || "Hora por definir";
  return `${date} | ${time}`;
}

function SpotlightStrip({ spotlights }) {
  return (
    <section className="spotlight-strip" aria-label="Destacados de jornada">
      {spotlights.map((item) => (
        <article key={item.label}>
          <span>{item.label}</span>
          <strong>{item.title}</strong>
          <small>{item.detail}</small>
        </article>
      ))}
    </section>
  );
}

function getTeamStandingSummary(standings, team) {
  return standings.find((row) => row.team.id === team.id) || {
    position: 0,
    points: 0,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    team
  };
}

function getTeamMatchSummary(activeLeague, teamId) {
  const teamMatches = activeLeague.matches
    .filter((match) => match.homeTeamId === teamId || match.awayTeamId === teamId)
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || String(b.time || "").localeCompare(String(a.time || "")));
  const nextMatch = [...teamMatches].reverse().find(isPublicScheduledMatch);
  const lastMatch = teamMatches.find((match) => match.status === "finished" || match.status === "walkover");
  return { lastMatch, nextMatch, teamMatches };
}

function getTeamDirectoryRows({ activeLeague, league, standings }) {
  const standingsOrder = new Map(standings.map((row, index) => [row.team.id, index]));
  return [...activeLeague.teams]
    .sort((a, b) => {
      const aIndex = standingsOrder.has(a.id) ? standingsOrder.get(a.id) : 999;
      const bIndex = standingsOrder.has(b.id) ? standingsOrder.get(b.id) : 999;
      return aIndex - bIndex || a.name.localeCompare(b.name);
    })
    .map((team, index) => {
      const standing = getTeamStandingSummary(standings, team);
      const players = getEligiblePlayersForTeam(league, team.id);
      const { nextMatch, lastMatch } = getTeamMatchSummary(activeLeague, team.id);
      return { index, lastMatch, nextMatch, players, standing, team };
    });
}

function TeamDirectory({ league, activeLeague, standings, onSelectTeam }) {
  if (!activeLeague.teams.length) return <p className="empty empty-polished">Aun no hay equipos registrados en este torneo.</p>;

  const rows = getTeamDirectoryRows({ activeLeague, league, standings });
  const activeTeams = rows.filter((row) => row.team.status !== "withdrawn").length;
  const totalPlayers = rows.reduce((sum, row) => sum + row.players.length, 0);
  const competitionName = activeLeague.currentCompetitionId ? getCompetition(league, activeLeague.currentCompetitionId)?.name : "";

  return (
    <section className="public-team-directory" aria-label="Lista de equipos">
      <div className="public-team-directory-hero">
        <div>
          <span>Equipos del torneo</span>
          <strong>{competitionName || "Categoria activa"}</strong>
          <small>{activeTeams} equipos activos · {totalPlayers} jugadores registrados</small>
        </div>
        <em>{rows.length}</em>
      </div>

      <div className="public-team-list">
        {rows.map(({ index, nextMatch, players, standing, team }) => (
          <button className="public-team-list-card" key={team.id} type="button" onClick={() => onSelectTeam(team.id)}>
            <span className="public-team-rank">{standing.position || index + 1}</span>
            <TeamMark team={team} className="public-team-list-crest" />
            <span className="public-team-list-main">
              <strong>{team.name}</strong>
              <small>{players.length} jugador(es) · {team.status === "withdrawn" ? "Baja" : "Activo"}</small>
              <em>{nextMatch ? `Proximo: J${nextMatch.round || "-"} · ${nextMatch.date ? formatDate(nextMatch.date) : "Fecha por definir"}` : "Sin partido programado"}</em>
            </span>
            <span className="public-team-list-stats" aria-label="Resumen competitivo">
              <span><strong>{standing.points}</strong><small>PTS</small></span>
              <span><strong>{standing.played}</strong><small>PJ</small></span>
            </span>
            <span className="public-team-card-chevron" aria-hidden="true">›</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function TeamRosterScreen({ league, activeLeague, standings, stats, team, onBack, onSelectPlayer }) {
  if (!team) return <p className="empty empty-polished">Selecciona un equipo para consultar su plantilla publica.</p>;

  const players = getEligiblePlayersForTeam(league, team.id);
  const groupedPlayers = groupPlayersByPosition(players);
  const standing = getTeamStandingSummary(standings, team);
  const statsByPlayer = new Map((stats || []).map((row) => [row.player.id, row]));
  const staff = [
    team.coach ? { name: team.coach, role: "Entrenador" } : null,
    team.assistantCoach ? { name: team.assistantCoach, role: "Auxiliar" } : null
  ].filter(Boolean);

  return (
    <section className="public-team-roster-screen" aria-label={`Plantilla de ${team.name}`}>
      <article className="public-team-roster-hero">
        <TeamMark team={team} className="public-team-roster-crest" />
        <div>
          <span>{team.status === "withdrawn" ? "Equipo dado de baja" : "Equipo activo"}</span>
          <strong>{team.name}</strong>
          <small>{players.length} jugador(es) · {staff.length ? staff.map((member) => `${member.role}: ${member.name}`).join(" · ") : "Cuerpo tecnico sin registrar"}</small>
        </div>
      </article>

      <div className="public-team-roster-stats">
        <span><strong>{standing.points}</strong><small>Puntos</small></span>
        <span><strong>{standing.played}</strong><small>PJ</small></span>
        <span><strong>{standing.goalsFor}</strong><small>GF</small></span>
        <span><strong>{standing.goalsAgainst}</strong><small>GC</small></span>
      </div>

      <div className="public-team-roster-list">
        {groupedPlayers.map((group) => (
          <section className="public-team-roster-group" key={group.id}>
            <h3>{group.label}</h3>
            {group.players.map((player) => {
              const playerRow = statsByPlayer.get(player.id) || {};
              const number = getPlayerNumberForTeam(league, player.id, team.id) || player.number || "-";
              const affiliation = getPlayerAffiliationForTeam(league, player.id, team.id);
              return (
                <button className="public-team-player-row" key={player.id} type="button" onClick={() => onSelectPlayer(player.id, team.id)}>
                  <PlayerAvatar player={player} className="public-team-player-avatar" />
                  <span className="public-team-player-number">{number}</span>
                  <span className="public-team-player-info">
                    <strong>{player.name}</strong>
                    <small>
                      {normalizePositionLabel(player.position)}
                      {affiliation ? ` · Afiliado de ${getTeam(league, player.teamId)?.name || "origen"}` : ""}
                    </small>
                  </span>
                  <span className="public-team-player-stats">
                    <strong>{playerRow.goals || 0}</strong>
                    <small>Goles</small>
                  </span>
                  <em aria-hidden="true">›</em>
                </button>
              );
            })}
          </section>
        ))}
        {!players.length && <p className="empty empty-polished">Este equipo aun no tiene jugadores registrados.</p>}
      </div>
    </section>
  );
}

function TeamProfile({ league, activeLeague, standings, stats, onSelectPlayer, selectedTeam, selectedTeamId, onSelectTeam }) {
  if (!activeLeague.teams.length) return <p className="empty">Aun no hay equipos registrados en esta categoria.</p>;
  if (!selectedTeam) return null;

  const players = getEligiblePlayersForTeam(league, selectedTeam.id);
  const teamMatches = activeLeague.matches
    .filter((match) => match.homeTeamId === selectedTeam.id || match.awayTeamId === selectedTeam.id)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || Number(b.round || 0) - Number(a.round || 0));
  const nextMatch = [...teamMatches].reverse().find(isPublicScheduledMatch);
  const lastMatch = teamMatches.find((match) => match.status === "finished" || match.status === "walkover");
  const staff = [
    selectedTeam.coach ? { name: selectedTeam.coach, role: "Entrenador" } : null,
    selectedTeam.assistantCoach ? { name: selectedTeam.assistantCoach, role: "Auxiliar" } : null
  ].filter(Boolean);
  const goalsByPlayer = new Map((stats || []).map((row) => [row.player.id, row.goals || 0]));
  const teamTopScorer = players
    .map((player) => ({ player, goals: goalsByPlayer.get(player.id) || 0 }))
    .sort((a, b) => b.goals - a.goals || a.player.name.localeCompare(b.player.name))[0];
  const groupedPlayers = groupPlayersByPosition(players);
  const standingRow = standings.find((row) => row.team.id === selectedTeam.id) || {
    points: 0,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0
  };

  return (
    <details className="team-profile" open>
      <summary>
        <div className="team-profile-head compact">
          <TeamMark team={selectedTeam} className="team-dot" />
          <div>
            <strong>{selectedTeam.name}</strong>
            <span>{players.length} jugador(es) registrados</span>
          </div>
        </div>
      </summary>

      <div className="team-profile-body">
        <TeamProfileSelector
          teams={activeLeague.teams}
          selectedTeamId={selectedTeamId}
          onSelectTeam={onSelectTeam}
        />

        <article className="team-profile-card">
          <div className="team-profile-hero">
            <TeamMark team={selectedTeam} className="team-crest" />
            <div>
              <strong>{selectedTeam.name}</strong>
              <span>{players.length} jugador(es) | {selectedTeam.status === "withdrawn" ? "Equipo dado de baja" : "Equipo activo"}</span>
            </div>
          </div>
          <div className="team-profile-kpis" aria-label="Resumen del equipo">
            <span><strong>{standingRow.points}</strong> Puntos</span>
            <span><strong>{standingRow.played}</strong> PJ</span>
            <span><strong>{standingRow.wins}</strong> G</span>
            <span><strong>{standingRow.draws}</strong> E</span>
            <span><strong>{standingRow.losses}</strong> P</span>
            <span><strong>{standingRow.goalsFor}</strong> GF</span>
            <span><strong>{standingRow.goalsAgainst}</strong> GC</span>
            <span><strong>{players.length}</strong> Jugadores</span>
          </div>
          <div className="team-profile-note">
            <span>Goleador del equipo</span>
            <strong>{teamTopScorer?.goals ? teamTopScorer.player.name : "Por definir"}</strong>
            <small>{teamTopScorer?.goals ? `${teamTopScorer.goals} gol(es)` : "Aun sin goles registrados"}</small>
          </div>
        </article>

        <section className="team-profile-section">
          <h3>Direccion tecnica</h3>
          <div className="team-staff-list">
            {staff.map((member) => (
              <article key={`${member.role}-${member.name}`}>
                <span className="staff-avatar">{getTeamInitials(member.name)}</span>
                <div>
                  <strong>{member.name}</strong>
                  <span>{member.role}</span>
                </div>
              </article>
            ))}
            {!staff.length && <p className="empty">Direccion tecnica sin registrar.</p>}
          </div>
        </section>

        <div className="team-profile-matches">
          {lastMatch ? (
            <article>
              <span className="eyebrow">Ultimo</span>
              <MatchVersus league={activeLeague} match={lastMatch} />
              <MatchScore match={lastMatch} />
              <MatchMeta match={lastMatch} />
            </article>
          ) : (
            <article><span className="eyebrow">Ultimo</span><strong>SIN RESULTADO</strong></article>
          )}
          {nextMatch ? (
            <article>
              <span className="eyebrow">Proximo</span>
              <MatchVersus league={activeLeague} match={nextMatch} />
              <MatchMeta match={nextMatch} />
            </article>
          ) : (
            <article><span className="eyebrow">Proximo</span><strong>SIN PROGRAMAR</strong></article>
          )}
        </div>

        <div className="public-squad-list">
          {groupedPlayers.map((group) => (
            <section className="squad-position-group" key={group.id}>
              <h3>{group.label}</h3>
              {group.players.map((player) => (
                <button
                  className="squad-player-button"
                  key={player.id}
                  type="button"
                  onClick={() => onSelectPlayer(player.id)}
                >
                  <span className="jersey-number" aria-label={`Jersey ${getPlayerNumberForTeam(league, player.id, selectedTeam.id) || "sin numero"}`}>
                    <span>{getPlayerNumberForTeam(league, player.id, selectedTeam.id) || "-"}</span>
                  </span>
                  <div>
                    <strong>{player.name}</strong>
                    <span>
                      {normalizePositionLabel(player.position)}
                      {getPlayerAffiliationForTeam(league, player.id, selectedTeam.id) ? ` | AFILIADO: ${getTeam(league, player.teamId)?.name || "ORIGEN"}` : ""}
                    </span>
                  </div>
                  <span className="player-goals-pill">{goalsByPlayer.get(player.id) || 0} gol(es)</span>
                </button>
              ))}
            </section>
          ))}
          {!players.length && <p className="empty">Este equipo aun no tiene jugadores registrados.</p>}
        </div>
      </div>
    </details>
  );
}

function TeamProfileSelector({ teams, selectedTeamId, onSelectTeam }) {
  const sortedTeams = [...teams].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="team-profile-selector" aria-label="Seleccionar equipo">
      {sortedTeams.map((team) => (
        <button
          className={team.id === selectedTeamId ? "active" : ""}
          key={team.id}
          type="button"
          onClick={() => onSelectTeam(team.id)}
        >
          <TeamMark team={team} className="team-selector-mark" />
          <span>{team.name}</span>
        </button>
      ))}
    </div>
  );
}

function SoccerBallMetricIcon() {
  return (
    <i className="player-metric-icon player-metric-ball" aria-hidden="true">⚽</i>
  );
}

function PlayerPublicCard({ league, seasonLeague = league, player, stats, onSelectTeam }) {
  if (!player) return <p className="empty empty-polished">Selecciona un jugador desde el buscador, goleadores o perfil de equipo para abrir su ficha deportiva.</p>;

  const row = stats.find((item) => item.player.id === player.id) || { goals: 0, yellowCards: 0, redCards: 0 };
  const seasonBreakdown = getPlayerSeasonBreakdown(seasonLeague, player.id);
  const showAffiliationBreakdown = seasonBreakdown.hasAffiliation && seasonBreakdown.rows.length > 1;
  const displayGoals = showAffiliationBreakdown ? seasonBreakdown.totals.goals : row.goals || 0;
  const displayYellowCards = showAffiliationBreakdown ? seasonBreakdown.totals.yellowCards : row.yellowCards || 0;
  const team = getTeam(league, player.teamId);
  const activePlayerTeam = row.team || team;
  const publicNumber = getPlayerNumberForTeam(seasonLeague, player.id, activePlayerTeam?.id || player.teamId) || player.number || "-";
  const teamPlayers = getEligiblePlayersForTeam(seasonLeague, activePlayerTeam?.id || player.teamId);
  const teamRanking = getPlayerTeamGoalRank(stats, player, teamPlayers);
  const teamMatches = league.matches
    .filter((match) => match.homeTeamId === (activePlayerTeam?.id || player.teamId) || match.awayTeamId === (activePlayerTeam?.id || player.teamId))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.time).localeCompare(String(a.time)));
  const nextMatch = [...teamMatches].reverse().find(isPublicScheduledMatch);
  const lastMatch = teamMatches.find((match) => match.status === "finished" || match.status === "walkover");
  const recentMatches = teamMatches.filter((match) => match.status === "finished" || match.status === "walkover").slice(0, 3);
  const playerEvents = getPlayerEvents(league, player.id);
  const lastGoal = playerEvents.find((item) => item.event.type === "goal");
  const discipline = getPlayerDisciplineState(league, row);
  const playerBadges = getPlayerBadges({ player, row, teamRanking, discipline });
  const age = getPlayerAge(player.birthDate);
  const playedMatches = teamMatches.filter((match) => match.status === "finished" || match.status === "walkover").length;
  const playerTeamId = activePlayerTeam?.id || player.teamId;
  const lastGoalMinute = lastGoal?.event?.minute ? `${lastGoal.event.minute}'` : "";

  return (
    <article className="player-public-card" style={{ "--player-stadium-photo": `url(${stadiumHero})` }}>
      <div className="player-public-titlebar">
        <span>Jugador</span>
        <strong>Ficha publica</strong>
      </div>
      <div className="player-public-hero">
        <div className="player-portrait-wrap">
          <PlayerAvatar player={player} className="player-public-avatar" />
          <span className="player-public-number">{publicNumber}</span>
        </div>
        <div className="player-public-identity">
          <span>{normalizePositionLabel(player.position)}</span>
          <strong>{player.name}</strong>
          <small><TeamMark team={activePlayerTeam} className="player-team-crest" />{activePlayerTeam?.name || team?.name || "Sin equipo"}</small>
          <div className="player-badge-row">
            {playerBadges.map((badge) => <span className={badge.tone} key={badge.label}>{badge.label}</span>)}
          </div>
        </div>
      </div>

      <div className="player-public-stats">
        <span className="metric-goals"><SoccerBallMetricIcon /><small>Goles</small><strong>{displayGoals}</strong></span>
        <span className="metric-pj"><small>PJ</small><strong>{playedMatches}</strong></span>
        <span className="metric-yellow"><small>Amarillas</small><strong>{displayYellowCards}</strong></span>
        <span className="metric-red"><small>Rojas</small><strong>{row.redCards || 0}</strong></span>
        {"assists" in row && <span className="metric-assists"><small>Asistencias</small><strong>{row.assists || 0}</strong></span>}
        <span className="metric-shield"><small>Suspensiones</small><strong>{row.suspensionMatches || 0}</strong></span>
      </div>

      {showAffiliationBreakdown && (
        <div className="player-affiliation-breakdown">
          <strong>Actividad por equipo en la temporada</strong>
          {seasonBreakdown.rows.map((item) => (
            <span key={item.team?.id || item.team?.name}>
              <small>{item.team?.name || "Equipo"}</small>
              <b>{item.goals} gol(es)</b>
              <b>{item.yellowCards} amarilla(s)</b>
            </span>
          ))}
          <span className="total">
            <small>Total temporada</small>
            <b>{seasonBreakdown.totals.goals} gol(es)</b>
            <b>{seasonBreakdown.totals.yellowCards} amarilla(s)</b>
          </span>
        </div>
      )}

      <div className="player-public-details">
        <span>
          <small>Estado disciplinario</small>
          <strong>{discipline.label}</strong>
        </span>
        <span>
          <small>Ranking del equipo</small>
          <strong>{teamRanking ? `#${teamRanking} en goles` : "Por definir"}</strong>
        </span>
        <span>
          <small>Categoria</small>
          <strong>{player.category || league.season || "Categoria libre"}</strong>
        </span>
        <span>
          <small>Edad</small>
          <strong>{age ? `${age} anos` : "No registrada"}</strong>
        </span>
      </div>

      <div className="player-public-matches">
        <article className={`player-discipline-card ${discipline.tone}`}>
          <span>Estado actual</span>
          <strong>{discipline.label}</strong>
          <small>{discipline.detail}</small>
        </article>
        <article>
          <span>Ultimo gol</span>
          <strong>{lastGoal ? `${lastGoalMinute ? `${lastGoalMinute} | ` : ""}${formatDate(lastGoal.match.date)} | J${lastGoal.match.round || "-"}` : "Este jugador aun no tiene goles registrados."}</strong>
        </article>
        {lastMatch && (
          <article className="player-match-summary-card">
            <span>Ultimo partido</span>
            <MatchVersus league={league} match={lastMatch} />
            <MatchScore match={lastMatch} />
          </article>
        )}
        {nextMatch && (
          <article className="player-match-summary-card">
            <span>Proximo partido</span>
            <MatchVersus league={league} match={nextMatch} />
            <MatchMeta match={nextMatch} />
          </article>
        )}
      </div>

      <div className="player-recent-history">
        <div className="player-recent-title">
          <strong>Historial reciente</strong>
          <span>Ver todo</span>
        </div>
        <div className="player-recent-grid">
          {recentMatches.map((match) => (
            <PlayerRecentMatchCard key={match.id} league={league} match={match} teamId={playerTeamId} />
          ))}
        </div>
        {!recentMatches.length && <p className="empty empty-polished">Este jugador aun no tiene historial reciente de partidos finalizados.</p>}
      </div>

      {activePlayerTeam && (
        <button
          className="player-team-link"
          type="button"
          onClick={() => onSelectTeam(activePlayerTeam.id)}
        >
          Ver perfil del equipo
        </button>
      )}
    </article>
  );
}

function PlayerRecentMatchCard({ league, match, teamId }) {
  const home = getTeam(league, match.homeTeamId);
  const away = getTeam(league, match.awayTeamId);
  const isHome = match.homeTeamId === teamId;
  const didWin = match.status === "finished" && (
    (isHome && Number(match.homeGoals || 0) > Number(match.awayGoals || 0)) ||
    (!isHome && Number(match.awayGoals || 0) > Number(match.homeGoals || 0))
  );
  const didLose = match.status === "finished" && (
    (isHome && Number(match.homeGoals || 0) < Number(match.awayGoals || 0)) ||
    (!isHome && Number(match.awayGoals || 0) < Number(match.homeGoals || 0))
  );

  return (
    <article className={`player-recent-card ${didLose ? "lost" : didWin ? "won" : ""}`}>
      <div className="player-recent-versus">
        <span><TeamMark team={home} className="player-recent-crest" />{home?.name || "Local"}</span>
        <b>VS</b>
        <span><TeamMark team={away} className="player-recent-crest" />{away?.name || "Visitante"}</span>
      </div>
      <MatchScore match={match} />
      <small>{match.date ? formatDate(match.date) : "Fecha por definir"} | {match.venue || "Cancha por definir"}</small>
    </article>
  );
}

function getPlayerEvents(league, playerId) {
  return finishedMatches(league)
    .flatMap((match) => (match.events || [])
      .filter((event) => event.playerId === playerId)
      .map((event) => ({ event, match })))
    .sort((a, b) => (
      String(b.match.date || "").localeCompare(String(a.match.date || "")) ||
      Number(b.match.round || 0) - Number(a.match.round || 0)
    ));
}

function getPlayerAge(birthDate) {
  if (!birthDate) return null;
  const date = new Date(birthDate);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  const monthDiff = today.getMonth() - date.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < date.getDate())) age -= 1;
  return age > 0 && age < 100 ? age : null;
}

function getPlayerTeamGoalRank(stats, player, teamPlayers) {
  const teamPlayerIds = new Set(teamPlayers.map((item) => item.id));
  const ranking = stats
    .filter((row) => teamPlayerIds.has(row.player.id))
    .sort((a, b) => b.goals - a.goals || a.player.name.localeCompare(b.player.name));
  const index = ranking.findIndex((row) => row.player.id === player.id);
  return index >= 0 && ranking[index].goals > 0 ? index + 1 : null;
}

function getPlayerDisciplineState(league, row) {
  const yellowLimit = Number(league.rules?.yellowSuspensionLimit || 3);
  if (row.suspensionIndefinite) {
    return {
      label: "Inhabilitado",
      tone: "danger",
      detail: "Tiene una suspension indefinida registrada."
    };
  }
  if (row.suspensionMatches > 0 || row.redCards > 0) {
    return {
      label: "Suspendido",
      tone: "danger",
      detail: `Tiene ${row.suspensionMatches || row.redCards} partido(s) de suspension registrados.`
    };
  }
  if (row.yellowCards >= Math.max(1, yellowLimit - 1)) {
    return {
      label: "En riesgo por tarjetas",
      tone: "warning",
      detail: `${row.yellowCards}/${yellowLimit} amarillas acumuladas.`
    };
  }
  return {
    label: "Limpio",
    tone: "clean",
    detail: "Sin sanciones activas registradas."
  };
}

function getPlayerBadges({ player, row, teamRanking, discipline }) {
  return [
    row.goals >= 3 ? { label: "Goleador", tone: "gold" } : null,
    player.captain ? { label: "Capitan", tone: "blue" } : null,
    teamRanking === 1 ? { label: "Lider del equipo", tone: "gold" } : null,
    discipline.tone === "danger" ? { label: "Suspendido", tone: "danger" } : null,
    row.goals || row.yellowCards || row.redCards ? { label: "Jugador regular", tone: "field" } : null
  ].filter(Boolean).slice(0, 3);
}

const PLAYER_POSITION_GROUPS = [
  { id: "arquero", label: "Arqueros", match: ["ARQUERO", "PORTERO"] },
  { id: "defensor", label: "Defensores", match: ["DEFENSOR", "DEFENSA"] },
  { id: "mediocampista", label: "Mediocampistas", match: ["MEDIOCAMPISTA", "MEDIO"] },
  { id: "delantero", label: "Delanteros", match: ["DELANTERO"] }
];

function normalizePositionLabel(position) {
  const value = String(position || "Jugador").trim();
  if (!value) return "Jugador";
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function getPositionGroupId(position) {
  const value = String(position || "").toLocaleUpperCase("es-MX");
  return PLAYER_POSITION_GROUPS.find((group) => group.match.some((item) => value.includes(item)))?.id || "otros";
}

function groupPlayersByPosition(players) {
  const grouped = new Map([
    ...PLAYER_POSITION_GROUPS.map((group) => [group.id, { ...group, players: [] }]),
    ["otros", { id: "otros", label: "Plantel", players: [] }]
  ]);

  for (const player of players) {
    grouped.get(getPositionGroupId(player.position)).players.push(player);
  }

  return [...grouped.values()].filter((group) => group.players.length);
}

function getTeamInitials(name) {
  return String(name || "E")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toLocaleUpperCase("es-MX") || "E";
}

function TeamMark({ team, className = "" }) {
  const label = team?.name || "Equipo";
  const style = { background: team?.colors || "var(--field)" };
  const canShowLogo = Boolean(team?.logoUrl);

  return (
    <span aria-hidden="true" className={`team-mark ${canShowLogo ? "has-image" : ""} ${className}`} style={style} title={label}>
      <span>{getTeamInitials(label)}</span>
      {canShowLogo && (
        <LoadableImage
          alt=""
          src={team.logoUrl}
          loading="eager"
        />
      )}
    </span>
  );
}

function PlayerAvatar({ player, className = "" }) {
  const canShowPhoto = Boolean(player?.photoAuthorized === true && player?.photoUrl);

  return (
    <span className={`player-avatar ${className}`} title={player?.name || "Jugador"}>
      {canShowPhoto && (
        <LoadableImage
          alt=""
          loading="lazy"
          src={player.photoUrl}
        />
      )}
      <span>{getTeamInitials(player?.name || "J")}</span>
    </span>
  );
}

function LoadableImage({ alt = "", className = "", loading = "lazy", src }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setIsLoaded(false);
    setHasError(false);
  }, [src]);

  if (!src || hasError) return null;

  return (
    <img
      alt={alt}
      className={`loadable-image ${isLoaded ? "is-loaded" : ""} ${className}`.trim()}
      decoding="async"
      loading={loading}
      src={src}
      onLoad={() => setIsLoaded(true)}
      onError={() => setHasError(true)}
    />
  );
}

function FairPlayTeams({ rows }) {
  if (!rows.length) return <p className="empty">Aun no hay equipos registrados.</p>;
  return (
    <div className="moment-list">
      {rows.map((row) => (
        <article key={row.team.id}>
          <strong>{row.team.name}</strong>
          <span>{row.yellow} amarilla(s), {row.red} roja(s)</span>
        </article>
      ))}
    </div>
  );
}

function competitionTypeLabel(type) {
  const labels = {
    liga: "Torneo de liga",
    copa: "Torneo de copa",
    barrios: "Torneo de barrios",
    amistoso: "Torneo amistoso"
  };

  return labels[type] || String(type || "Torneo").toLocaleUpperCase("es-MX");
}

function TournamentSelector({
  activeCompetition,
  competitions,
  league,
  selectedCompetitionId,
  selectedSeason,
  onSelectCompetition,
  onSelectSeason
}) {
  const [isSeasonSheetOpen, setSeasonSheetOpen] = useState(false);
  const [isCategorySheetOpen, setCategorySheetOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");

  if (!competitions.length) return <p className="empty">Aun no hay torneos registrados.</p>;

  const seasonOptions = buildSeasonOptions(competitions, league);
  const selectedSeasonValue = selectedSeason || getSeasonValue(activeCompetition, league) || seasonOptions[0]?.name || league.season;
  const selectedSeasonId = getSeasonId(selectedSeasonValue);
  const selectedSeasonOption = seasonOptions.find((season) => season.id === selectedSeasonId) || seasonOptions[0];
  const seasonCompetitions = competitions.filter((competition) => getSeasonId(getSeasonValue(competition, league)) === selectedSeasonId);
  const visibleCompetitions = seasonCompetitions.length ? seasonCompetitions : competitions;
  const visibleLimit = 4;
  const primaryCompetitions = visibleCompetitions.slice(0, visibleLimit);
  const shouldShowAllButton = visibleCompetitions.length > visibleLimit;
  const filteredSheetCompetitions = visibleCompetitions.filter((competition) => (
    !categorySearch ||
    normalizeSearchTerm(`${competition.name} ${competition.type || ""} ${competition.description || ""}`)
      .includes(normalizeSearchTerm(categorySearch))
  ));

  function selectSeason(season) {
    const firstCompetition = competitions.find((competition) => getSeasonId(getSeasonValue(competition, league)) === season.id);
    onSelectSeason(season.name);
    if (firstCompetition) onSelectCompetition(firstCompetition.id);
    setSeasonSheetOpen(false);
  }

  function selectCategory(competitionId) {
    const competition = competitions.find((item) => item.id === competitionId);
    if (competition) onSelectSeason(getSeasonValue(competition, league));
    onSelectCompetition(competitionId);
    setCategorySheetOpen(false);
    setCategorySearch("");
  }

  return (
    <div className="tournament-selector" aria-label="Seleccionar temporada y torneo">
      <header className="tournament-selector-head">
        <span>Elige tu torneo</span>
        <h2>Selecciona tu torneo</h2>
        <p>Elige la temporada y categoria que deseas consultar.</p>
      </header>

      <div className="tournament-selector-layout">
        <SeasonSelect
          isCurrent={selectedSeasonOption?.isCurrent}
          label={selectedSeasonOption?.name || selectedSeasonValue}
          onOpen={() => setSeasonSheetOpen(true)}
        />

        <section className="category-select-block" aria-labelledby="category-selector-label">
          <div className="selector-step-label" id="category-selector-label">
            <b>2</b>
            <span>Categoria</span>
          </div>
          <div className="category-options">
            {primaryCompetitions.map((competition) => (
              <CategoryOption
                competition={competition}
                isSelected={competition.id === selectedCompetitionId}
                key={competition.id}
                league={league}
                onSelect={() => selectCategory(competition.id)}
              />
            ))}
          </div>
          {shouldShowAllButton && (
            <button
              className="category-show-all-button"
              type="button"
              onClick={() => setCategorySheetOpen(true)}
            >
              <span>Ver todos los torneos</span>
              <b aria-hidden="true">›</b>
            </button>
          )}
        </section>
      </div>

      <CurrentTournamentSummary
        competition={activeCompetition}
        season={selectedSeasonOption?.name || selectedSeasonValue}
      />

      {isSeasonSheetOpen && (
        <TournamentBottomSheet
          title="Selecciona temporada"
          subtitle="Temporadas disponibles"
          onClose={() => setSeasonSheetOpen(false)}
        >
          <div className="tournament-sheet-list clean">
            {seasonOptions.map((season) => (
              <button
                aria-selected={season.id === selectedSeasonId}
                className={season.id === selectedSeasonId ? "active" : ""}
                key={season.id}
                role="option"
                type="button"
                onClick={() => selectSeason(season)}
              >
                <span className="sheet-season-icon" aria-hidden="true">▣</span>
                <span>
                  <strong>{season.name}</strong>
                  <small>{season.isCurrent ? "Temporada actual" : `${season.count} torneo(s)`}</small>
                </span>
                <em>{season.id === selectedSeasonId ? "✓" : "›"}</em>
              </button>
            ))}
          </div>
        </TournamentBottomSheet>
      )}

      {isCategorySheetOpen && (
        <TournamentBottomSheet
          title="Todos los torneos"
          subtitle={selectedSeasonOption?.name || selectedSeasonValue}
          onClose={() => {
            setCategorySheetOpen(false);
            setCategorySearch("");
          }}
        >
          <label className={`tournament-sheet-search ${categorySearch ? "has-value" : ""}`}>
            <span>Buscar torneo</span>
            <input
              type="search"
              value={categorySearch}
              placeholder="Primera, Fut 7..."
              onChange={(event) => setCategorySearch(event.target.value)}
            />
            {categorySearch && (
              <button
                className="search-clear-button"
                type="button"
                aria-label="Limpiar busqueda"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setCategorySearch("")}
              >
                X
              </button>
            )}
          </label>
          <div className="tournament-sheet-list compact" role="listbox" aria-label="Torneos disponibles">
            {filteredSheetCompetitions.map((competition) => (
              <button
                aria-selected={competition.id === selectedCompetitionId}
                className={competition.id === selectedCompetitionId ? "active" : ""}
                key={competition.id}
                role="option"
                type="button"
                onClick={() => selectCategory(competition.id)}
              >
                <CompetitionMark
                  accent={getCompetitionAccent(competitions, competition.id)}
                  label={competition.name}
                />
                <span>
                  <strong>{competition.name}</strong>
                  <small>{competitionTypeLabel(competition.type)} | {getSeasonValue(competition, league)}</small>
                </span>
                <em>{competition.id === selectedCompetitionId ? "Actual" : "Elegir"}</em>
              </button>
            ))}
            {!filteredSheetCompetitions.length && <p className="empty">No encontramos torneos con esa busqueda.</p>}
          </div>
        </TournamentBottomSheet>
      )}
    </div>
  );
}

function buildSeasonOptions(competitions, league) {
  const counts = new Map();
  for (const competition of competitions) {
    const name = getSeasonValue(competition, league);
    const id = getSeasonId(name);
    const current = counts.get(id) || { count: 0, id, isCurrent: name === league.season, name };
    counts.set(id, { ...current, count: current.count + 1, isCurrent: current.isCurrent || name === league.season });
  }

  return [...counts.values()].sort((a, b) => (
    Number(b.isCurrent) - Number(a.isCurrent) ||
    String(b.name).localeCompare(String(a.name), "es-MX", { numeric: true })
  ));
}

function SeasonSelect({ isCurrent, label, onOpen }) {
  return (
    <section className="season-select-block" aria-labelledby="season-selector-label">
      <div className="selector-step-label" id="season-selector-label">
        <b>1</b>
        <span>Temporada</span>
      </div>
      <button
        className="season-select-button"
        type="button"
        aria-haspopup="dialog"
        onClick={onOpen}
      >
        <span className="season-select-icon" aria-hidden="true" />
        <strong>{label}</strong>
        {isCurrent && <em>Actual</em>}
        <b aria-hidden="true">⌄</b>
      </button>
      <small className="season-select-help">Selecciona la temporada que deseas consultar</small>
    </section>
  );
}

function CategoryOption({ competition, isSelected, league, onSelect }) {
  return (
    <button
      aria-pressed={isSelected}
      className={isSelected ? "category-option selected" : "category-option"}
      type="button"
      onClick={onSelect}
    >
      <span className="category-option-icon" aria-hidden="true">
        {getCompetitionShortCode(competition.name)}
      </span>
      <span className="category-option-copy">
        <strong>{competition.name}</strong>
        <small>{competition.description || competitionTypeLabel(competition.type)}</small>
        {!isSelected && <em>Toca para seleccionar</em>}
      </span>
      <span className="category-option-action" aria-hidden="true">
        {isSelected ? "✓" : "›"}
      </span>
      {isSelected && <span className="category-option-state">Seleccionado</span>}
      <span className="sr-only">
        {getSeasonValue(competition, league)} {isSelected ? "seleccionado" : "disponible"}
      </span>
    </button>
  );
}

function getCompetitionShortCode(name) {
  const words = String(name || "LT").trim().split(/\s+/).filter(Boolean);
  if (/fut\s*7|f7/i.test(name)) return "F7";
  return words.slice(0, 2).map((word) => word[0]).join("").toLocaleUpperCase("es-MX") || "LT";
}

function CurrentTournamentSummary({ competition, season }) {
  return (
    <div className="current-tournament-summary" aria-live="polite">
      <span aria-hidden="true" />
      <p>
        Mostrando:
        <strong>{season}</strong>
        <b aria-hidden="true">•</b>
        <strong>{competition?.name || "Torneo"}</strong>
      </p>
    </div>
  );
}

function TournamentBottomSheet({ children, onClose, subtitle, title }) {
  return (
    <div className="tournament-selector-sheet-backdrop" role="presentation" onClick={onClose}>
      <section
        aria-label={title}
        aria-modal="true"
        className="tournament-selector-sheet"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="tournament-selector-sheet-head">
          <div>
            <span>{subtitle}</span>
            <strong>{title}</strong>
          </div>
          <button type="button" aria-label="Cerrar selector" onClick={onClose}>×</button>
        </div>
        {children}
      </section>
    </div>
  );
}

function PlayoffList({ league, matches }) {
  if (!matches.length) return <p className="empty">Aun no hay partidos de liguilla programados en este torneo.</p>;
  const sortedMatches = [...matches].sort((a, b) => (
    String(a.playoffRound || "").localeCompare(String(b.playoffRound || "")) ||
    String(a.playoffLeg || "").localeCompare(String(b.playoffLeg || "")) ||
    String(a.date || "").localeCompare(String(b.date || "")) ||
    String(a.time || "").localeCompare(String(b.time || ""))
  ));
  const groups = sortedMatches.reduce((items, match) => {
    const label = [match.playoffRound || "Liguilla", match.playoffLeg].filter(Boolean).join(" | ");
    const last = items[items.length - 1];
    if (last?.label === label) {
      last.matches.push(match);
    } else {
      items.push({ label, matches: [match] });
    }
    return items;
  }, []);

  return (
    <div className="playoff-list">
      {groups.map((group) => (
        <section className="playoff-phase-group" key={group.label}>
          <div className="round-summary playoff-round-summary">
            <strong>{group.label}</strong>
            <span>{group.matches.length} partido(s)</span>
          </div>
          <div className="match-list">
            {group.matches.map((match) => <MatchCard key={match.id} league={league} match={match} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

function hasMatchScoreValue(value) {
  return value !== null && value !== undefined && value !== "";
}

function getMatchTiebreakerRows(match) {
  const rows = [];
  if (hasMatchScoreValue(match.extraTimeHomeGoals) && hasMatchScoreValue(match.extraTimeAwayGoals)) {
    rows.push({ label: "Tiempo extra", value: `${match.extraTimeHomeGoals} - ${match.extraTimeAwayGoals}` });
  }
  if (hasMatchScoreValue(match.penaltyHomeGoals) && hasMatchScoreValue(match.penaltyAwayGoals)) {
    rows.push({ label: "Penales", value: `${match.penaltyHomeGoals} - ${match.penaltyAwayGoals}` });
  }
  return rows;
}

function RoundSelector({ rounds, selectedRound, onSelectRound }) {
  const tabsRef = useRef(null);
  const activeButtonRef = useRef(null);

  useEffect(() => {
    const activeButton = activeButtonRef.current;
    const tabs = tabsRef.current;
    if (!activeButton || !tabs) return;
    const nextLeft = activeButton.offsetLeft - (tabs.clientWidth - activeButton.offsetWidth) / 2;
    tabs.scrollTo({ left: Math.max(0, nextLeft), behavior: "smooth" });
  }, [rounds, selectedRound]);

  if (!rounds.length) return <p className="empty">Aun no hay jornadas programadas.</p>;

  return (
    <div className="round-tabs" aria-label="Seleccionar jornada" ref={tabsRef}>
      {rounds.map((round) => {
        const isActive = Number(selectedRound) === Number(round);
        return (
          <button
            aria-current={isActive ? "true" : undefined}
            className={isActive ? "active" : ""}
            key={round}
            ref={isActive ? activeButtonRef : null}
            type="button"
            onClick={() => onSelectRound(round)}
          >
            <span>J{round}</span>
            {isActive && <small>Activa</small>}
          </button>
        );
      })}
    </div>
  );
}

function SummaryStat({ value, label }) {
  return (
    <article>
      <strong>{value}</strong>
      <span>{label}</span>
    </article>
  );
}

function StandingInsightWatermark({ type }) {
  if (type === "attack") {
    return (
      <svg aria-hidden="true" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r="24" />
        <path d="M32 8v48M8 32h48M16 18c10 7 22 7 32 0M16 46c10-7 22-7 32 0M20 14c6 12 6 24 0 36M44 14c-6 12-6 24 0 36" />
      </svg>
    );
  }
  if (type === "defense") {
    return (
      <svg aria-hidden="true" viewBox="0 0 64 64">
        <path d="M32 7l22 8v15c0 14-8 23-22 29C18 53 10 44 10 30V15l22-8z" />
        <path d="M22 31l7 7 14-16" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 64 64">
      <path d="M14 26l7 25h22l7-25-12 9-6-18-6 18-12-9z" />
      <path d="M21 51h22M32 17v-6M16 25l-5-5M48 25l5-5" />
    </svg>
  );
}

function StandingsTable({
  activePanel = "tabla",
  disciplineRows = [],
  onBack,
  onSelectPanel,
  onSelectPlayer,
  onShareDiscipline,
  onShareScorers,
  onShareStandings,
  onShareSuspensions,
  rows,
  rules,
  league,
  competition,
  scorers = [],
  suspensionNotices = []
}) {
  const [standingsScope, setStandingsScope] = useState("general");
  const [disciplinePanel, setDisciplinePanel] = useState(activePanel === "expulsiones" ? "expulsiones" : "amarillas");
  if (!rows.length) return <p className="empty">Aun no hay equipos registrados.</p>;
  const playoffQualifiers = Math.max(0, Number(rules?.playoffQualifiers ?? 8));
  const qualifiedCount = Math.min(playoffQualifiers, rows.length);
  const playoffLabel = getPlayoffPhaseLabel(playoffQualifiers);
  const competitionLabel = competition?.name || league?.season || "Competencia";
  const seasonLabel = competition?.season || league?.season || "";
  const categoryLabel = competition?.category || competition?.division || league?.category || "Primera fuerza";
  const displayedRows = standingsScope === "playoff" && qualifiedCount > 0 ? rows.slice(0, qualifiedCount) : rows;
  const currentPanel = activePanel === "expulsiones" ? "disciplina" : activePanel;
  const visibleDisciplinePanel = activePanel === "expulsiones" ? "expulsiones" : disciplinePanel;
  const topScorers = scorers.slice(0, 10);
  const statLabels = [
    ["PJ", "played"],
    ["G", "wins"],
    ["E", "draws"],
    ["P", "losses"],
    ["GF", "goalsFor"],
    ["GC", "goalsAgainst"],
    ["DG", "goalDifference"]
  ];
  const shareByPanel = () => {
    if (currentPanel === "goleo") return onShareScorers?.();
    if (currentPanel === "disciplina" && visibleDisciplinePanel === "amarillas") return onShareDiscipline?.();
    if (currentPanel === "disciplina" && visibleDisciplinePanel === "expulsiones") return onShareSuspensions?.();
    return onShareStandings?.();
  };
  const selectStatsPanel = (panel) => {
    if (panel === "disciplina") setDisciplinePanel("amarillas");
    onSelectPanel?.(panel);
  };
  const selectDisciplineTab = (panel) => {
    setDisciplinePanel(panel);
    if (panel === "expulsiones") {
      onSelectPanel?.("expulsiones");
      return;
    }
    onSelectPanel?.("disciplina");
  };

  return (
    <section className="standings-showcase" aria-label="Tabla de posiciones">
      <div className="standings-showcase-topbar">
        <button className="standings-back-button" type="button" onClick={onBack} aria-label="Volver al inicio">
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="m15 5-7 7 7 7" />
          </svg>
        </button>
        <div className="standings-showcase-brand" aria-label="LIGATEC">
          <img alt="LIGATEC" src={ligatecLogo} />
          <div>
            <strong>LIGA<span>TEC</span></strong>
            <small>La evolucion digital de tu liga</small>
          </div>
        </div>
        <button className="standings-share-button" type="button" onClick={shareByPanel}>
            <ShareGlyph />
            <strong>Compartir</strong>
        </button>
      </div>
      <div className="standings-showcase-heading">
        <span>Competencia</span>
        <h3>{seasonLabel || competitionLabel}</h3>
        <strong>{categoryLabel}</strong>
      </div>
      <div className="standings-section-tabs" aria-label="Secciones de estadisticas">
        <button className={currentPanel === "tabla" ? "active" : ""} type="button" onClick={() => selectStatsPanel("tabla")}>
          <StandingsTabIcon type="table" />
          <span>Tabla</span>
        </button>
        <button className={currentPanel === "goleo" ? "active" : ""} type="button" onClick={() => selectStatsPanel("goleo")}>
          <StandingsTabIcon type="scorers" />
          <span>Goleo</span>
        </button>
        <button className={currentPanel === "disciplina" ? "active" : ""} type="button" onClick={() => selectStatsPanel("disciplina")}>
          <StandingsTabIcon type="discipline" />
          <span>Disciplina</span>
        </button>
      </div>
      <div className={`standings-content-shell panel-${currentPanel}`}>
        {currentPanel === "tabla" && (
          <>
          <div className="standings-stage-tabs" aria-label="Zona de tabla">
            <button
              aria-pressed={standingsScope === "general"}
              className={standingsScope === "general" ? "active" : ""}
              type="button"
              onClick={() => setStandingsScope("general")}
            >
              <span>Tabla general</span>
              <small>{rows.length} equipos</small>
            </button>
            <button
              aria-pressed={standingsScope === "playoff"}
              className={standingsScope === "playoff" ? "active" : ""}
              disabled={qualifiedCount <= 0}
              type="button"
              onClick={() => setStandingsScope("playoff")}
            >
              <span>Zona de liguilla</span>
              <small>{qualifiedCount > 0 ? `${qualifiedCount} clasificados${playoffLabel ? ` | ${playoffLabel}` : ""}` : "Sin liguilla"}</small>
            </button>
          </div>
          <div className="standings-board" role="table">
            <div className="standings-board-header" role="row">
              <span>#</span>
              <span>Equipo</span>
              <span>PTS</span>
              {statLabels.map(([label]) => <span key={label}>{label}</span>)}
            </div>
            {displayedRows.map((row) => {
              const rank = rows.findIndex((item) => item.team.id === row.team.id) + 1;
              const isQualified = standingsScope === "playoff" && rank > 0 && rank <= qualifiedCount;
              return (
                <div className="standings-row-group" key={row.team.id}>
                  <article
                    className={[`rank-${rank}`, rank <= 3 ? "top-rank" : "", isQualified ? "qualified-playoff" : ""].filter(Boolean).join(" ")}
                    role="row"
                  >
                    <span className="position-cell" role="cell">{rank}</span>
                    <span className="standings-team" role="cell">
                      <TeamMark team={row.team} className="standings-crest" />
                      <span className="team-name-cell">{row.team.name}</span>
                    </span>
                    <span className="points-cell" role="cell"><strong>{row.points}</strong></span>
                    <span className="standings-row-stats" role="cell">
                      {statLabels.map(([label, key]) => (
                        <span key={label}>
                          <small>{label}</small>
                          <strong>{row[key]}</strong>
                        </span>
                      ))}
                    </span>
                    {statLabels.map(([label, key]) => (
                      <span className="standing-stat-desktop" key={label} role="cell">{row[key]}</span>
                    ))}
                  </article>
                </div>
              );
            })}
          </div>
          <StandingsInsights rows={rows} />
          <StandingsLegend />
          </>
        )}
        {currentPanel === "goleo" && (
          <PublicScorersBoard rows={topScorers} onSelectPlayer={onSelectPlayer} />
        )}
        {currentPanel === "disciplina" && (
          <PublicDisciplineScreen
            activePanel={visibleDisciplinePanel}
            league={league}
            rows={disciplineRows}
            suspensionNotices={suspensionNotices}
            onSelectPanel={selectDisciplineTab}
          />
        )}
      </div>
    </section>
  );
}

function StandingsLegend() {
  const items = [
    ["PJ", "Partidos jugados"],
    ["G", "Ganados"],
    ["E", "Empatados"],
    ["P", "Perdidos"],
    ["GF", "Goles a favor"],
    ["GC", "Goles en contra"],
    ["DG", "Diferencia de goles"],
    ["PTS", "Puntos"]
  ];

  return (
    <div className="standings-legend-modern" aria-label="Leyenda de tabla">
      {items.map(([abbr, label]) => (
        <span key={abbr}><strong>{abbr}:</strong> {label}</span>
      ))}
    </div>
  );
}

function PublicScorersBoard({ rows, onSelectPlayer }) {
  if (!rows.length) {
    return <p className="empty empty-polished public-stats-empty">Aun no hay goles registrados en este torneo.</p>;
  }

  return (
    <section className="public-stats-board public-scorers-board" aria-label="Tabla de goleo">
      <header className="public-stats-board-head">
        <div>
          <span>Top 10</span>
          <strong>Goleadores</strong>
        </div>
        <small>Ranking del torneo activo</small>
      </header>
      <div className="public-scorers-list">
        {rows.map((row, index) => (
          <button
            className={`public-scorer-card rank-${index + 1}`}
            key={row.player.id}
            type="button"
            onClick={() => onSelectPlayer?.(row.player.id)}
          >
            <span className="public-scorer-rank">{index + 1}</span>
            <PlayerAvatar player={row.player} className="public-scorer-avatar" />
            <span className="public-scorer-copy">
              <strong>{row.player.name}</strong>
              <small><TeamMark team={row.team} className="public-scorer-team-mark" />{row.team?.name || "Sin equipo"}</small>
            </span>
            <span className="public-scorer-total">
              <strong>{row.goals}</strong>
              <small>{row.goals === 1 ? "gol" : "goles"}</small>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function PublicDisciplineScreen({ activePanel, league, rows, suspensionNotices, onSelectPanel }) {
  const panel = activePanel === "expulsiones" ? "expulsiones" : "amarillas";

  return (
    <>
      <div className="standings-stage-tabs discipline-stage-tabs" aria-label="Control disciplinario">
        <button
          aria-pressed={panel === "amarillas"}
          className={panel === "amarillas" ? "active" : ""}
          type="button"
          onClick={() => onSelectPanel?.("amarillas")}
        >
          <span>Disciplina</span>
          <small>Amarillas y trazabilidad</small>
        </button>
        <button
          aria-pressed={panel === "expulsiones"}
          className={panel === "expulsiones" ? "active" : ""}
          type="button"
          onClick={() => onSelectPanel?.("expulsiones")}
        >
          <span>Expulsiones</span>
          <small>Regresos y origen</small>
        </button>
      </div>
      {panel === "amarillas" ? (
        <PublicYellowDisciplineBoard league={league} rows={rows} />
      ) : (
        <PublicSuspensionsBoard league={league} notices={suspensionNotices} />
      )}
    </>
  );
}

function PublicYellowDisciplineBoard({ league, rows }) {
  if (!rows.length) {
    return <p className="empty empty-polished public-stats-empty">Sin amarillas vigentes registradas.</p>;
  }

  return (
    <section className="public-stats-board public-discipline-board" aria-label="Disciplina de amarillas">
      <header className="public-stats-board-head">
        <div>
          <span>Disciplina</span>
          <strong>Amarillas</strong>
        </div>
        <small>{rows.length} jugador(es) en seguimiento</small>
      </header>
      <div className="public-yellow-list">
        {rows.map((row) => (
          <article className={`public-yellow-card ${row.status}`} key={row.player.id}>
            <div className="public-yellow-card-main">
              <span className="public-yellow-icon">🟨</span>
              <div>
                <strong>{row.player.name}</strong>
                <small>{row.team?.name || "Sin equipo"}</small>
              </div>
              <span className="public-yellow-count">{row.yellowCards}/{row.yellowLimit}</span>
            </div>
            <div className="public-yellow-meter" aria-hidden="true">
              <span style={{ width: `${Math.min(100, Math.max(0, (Number(row.yellowCards || 0) / Number(row.yellowLimit || 1)) * 100))}%` }} />
            </div>
            <p>{row.message}</p>
            {!!row.sources?.length && (
              <div className="public-source-list" aria-label="Origen de amarillas">
                {row.sources.map((source, index) => (
                  <span className="public-source-pill" key={`${row.player.id}-${source.matchId || source.adjustmentId || index}`}>
                    {getYellowSourceLabel(league, source)}
                  </span>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function PublicSuspensionsBoard({ league, notices }) {
  if (!notices.length) {
    return <p className="empty empty-polished public-stats-empty">No hay jugadores expulsados o suspendidos activos.</p>;
  }

  return (
    <section className="public-stats-board public-suspensions-board" aria-label="Expulsiones y regresos">
      <header className="public-stats-board-head">
        <div>
          <span>Disciplina</span>
          <strong>Expulsiones y regresos</strong>
        </div>
        <small>{notices.length} caso(s) activos</small>
      </header>
      <div className="public-suspension-list-blue">
        {notices.map((notice) => {
          const originLabel = getSuspensionOriginLabel(league, notice);
          const returnLabel = getSuspensionReturnLabel(league, notice);
          return (
            <article className={`public-suspension-card ${notice.pendingReview ? "review" : ""}`} key={notice.id}>
              <div className="public-suspension-card-main">
                <span className="public-suspension-icon">🟥</span>
                <div>
                  <strong>{notice.player.name}</strong>
                  <small>{notice.team?.name || "Sin equipo"}</small>
                </div>
              </div>
              <p>
                {notice.pendingReview ? "Expulsado y sujeto a revision por comision disciplinaria." : notice.indefinite ? (
                  `${notice.type === "Expulsion" ? "Expulsado" : "Suspendido"} con inhabilitacion indefinida.`
                ) : (
                  `${notice.type === "Expulsion" ? "Expulsado" : "Suspendido"} por ${notice.totalMatches} partido(s). Le restan ${notice.remainingMatches} juego(s).${notice.returnRound ? ` Podra regresar en la jornada ${notice.returnRound}.` : ""}`
                )}
              </p>
              {notice.reason && <small className="public-suspension-reason">{notice.reason}</small>}
              <div className="public-suspension-meta">
                <span><strong>Origen</strong>{originLabel}</span>
                {returnLabel && <span><strong>Regreso</strong>{returnLabel}</span>}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function getYellowSourceLabel(league, source) {
  if (source?.matchId) {
    const match = league.matches.find((item) => item.id === source.matchId);
    if (match) {
      return `J${match.round || "-"} | ${getMatchShortTitle(league, match)} | ${formatDate(source.date || match.date)}`;
    }
  }
  if (source?.type === "Ajuste") {
    return `Ajuste | ${source.date ? formatDate(source.date) : "Sin fecha"}${source.reason ? ` | ${source.reason}` : ""}`;
  }
  return source?.date ? `Origen | ${formatDate(source.date)}` : "Origen pendiente";
}

function getSuspensionOriginLabel(league, notice) {
  const match = notice?.originMatch || (notice?.origin?.matchId ? league.matches.find((item) => item.id === notice.origin.matchId) : null);
  if (match) {
    return `J${match.round || notice.origin?.round || "-"} | ${getMatchShortTitle(league, match)} | ${formatDate(match.date || notice.origin?.date)}`;
  }
  if (notice?.origin?.date) return formatDate(notice.origin.date);
  return "Origen pendiente";
}

function getSuspensionReturnLabel(league, notice) {
  if (notice?.returnMatch) {
    return `J${notice.returnMatch.round || "-"} | ${getMatchShortTitle(league, notice.returnMatch)} | ${formatDate(notice.returnMatch.date)}`;
  }
  if (notice?.nextMatch) return `Proximo bloqueo: J${notice.nextMatch.round || "-"} | ${getMatchShortTitle(league, notice.nextMatch)}`;
  return "";
}

function ShareGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <circle cx="18" cy="5" r="2.4" />
      <circle cx="6" cy="12" r="2.4" />
      <circle cx="18" cy="19" r="2.4" />
      <path d="m8.2 11 7.5-4.6M8.2 13l7.5 4.6" />
    </svg>
  );
}

function StandingsTabIcon({ type }) {
  if (type === "table") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M5 19V9M12 19V5M19 19v-7" />
        <path d="M4 19h16" />
      </svg>
    );
  }
  if (type === "scorers") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="7.2" />
        <path d="m9.2 11.3 2.2-1.6 2.4 1.3-.6 2.8h-2.8z" />
        <path d="M12 4.8v4.9M5.5 10.2l3.7 1.1M18.5 10.2l-3.7 1.1M7.9 17.4l2.5-3.6M16.1 17.4l-2.9-3.6" />
      </svg>
    );
  }
  if (type === "discipline") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M8 5.5h6.6l1.4 13H9.4z" />
        <path d="M10.1 4h5.5" />
        <path d="m12.4 8.5 2.3 2.2-2.3 2.3" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M5 7h14M8 12h8M10 17h4" />
      <path d="M7.2 7a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4ZM16.8 13.2a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4ZM12 18.2a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4Z" />
    </svg>
  );
}

function StandingsInsights({ rows }) {
  const leader = rows[0];
  const bestAttack = [...rows].sort((a, b) => b.goalsFor - a.goalsFor || b.points - a.points)[0];
  const bestDefense = [...rows].sort((a, b) => a.goalsAgainst - b.goalsAgainst || b.points - a.points)[0];
  const insights = [
    leader ? { label: "Lider", team: leader.team, value: `${leader.points} pts`, type: "leader" } : null,
    bestAttack ? { label: "Mejor ofensiva", team: bestAttack.team, value: `${bestAttack.goalsFor} GF`, type: "attack" } : null,
    bestDefense ? { label: "Mejor defensa", team: bestDefense.team, value: `${bestDefense.goalsAgainst} GC`, type: "defense" } : null
  ].filter(Boolean);

  return (
    <div className="standings-insights" aria-label="Resumen rapido de tabla">
      {insights.map((item) => (
        <article className={`insight-${item.type}`} key={item.label}>
          <span className="standings-insight-watermark"><StandingInsightWatermark type={item.type} /></span>
          <span>{item.label}</span>
          <strong>{item.team.name}</strong>
          <small>{item.value}</small>
        </article>
      ))}
    </div>
  );
}

function getMatchStatusLabel(match) {
  const labels = {
    scheduled: "Programado",
    rescheduled: "Reprogramado",
    advanced: "Adelantado",
    postponed: "Pospuesto",
    live: "En juego",
    in_progress: "En juego",
    finished: "Finalizado",
    walkover: "Default",
    pending_sheet: "Pendiente de acta"
  };
  if (match.status === "finished" && !(match.events || []).length) return "Pendiente de acta";
  return labels[match.status] || "Programado";
}

function isPublicScheduledMatch(match) {
  return ["scheduled", "rescheduled", "advanced"].includes(match?.status || "scheduled");
}

function isPublicPlayableScheduledMatch(match) {
  return isPublicScheduledMatch(match) && Boolean(match?.date && match?.time && match?.venue);
}

function getPublicMatchStatusGroup(match) {
  if (["live", "in_progress"].includes(match?.status)) return "en-vivo";
  if (["finished", "walkover", "pending_sheet"].includes(match?.status)) return "finalizados";
  return "programados";
}

function getPublicMatchTone(match) {
  if (match?.status === "postponed") return "tone-postponed";
  if (["rescheduled", "advanced"].includes(match?.status)) return "tone-rescheduled";
  if (match?.status === "suspended") return "tone-suspended";
  if (match?.status === "pending_sheet") return "tone-pending";
  if (["finished", "walkover", "pending_sheet"].includes(match?.status)) return "tone-finished";
  if (["live", "in_progress"].includes(match?.status)) return "tone-live";
  return "tone-scheduled";
}

function getNextPlayableRound(matches, rounds = []) {
  const now = new Date();
  const playableMatches = [...matches]
    .filter((match) => Number(match.round || 0) && isPublicPlayableScheduledMatch(match))
    .sort((a, b) => (
      Number(["live", "in_progress"].includes(b?.status)) - Number(["live", "in_progress"].includes(a?.status)) ||
      parsePublicMatchDateTime(a) - parsePublicMatchDateTime(b) ||
      Number(a.round || 0) - Number(b.round || 0)
    ));
  const nextFutureMatch = playableMatches.find((match) => parsePublicMatchDateTime(match) >= now);
  const nextMatch = nextFutureMatch || playableMatches[0];
  if (nextMatch?.round && rounds.includes(Number(nextMatch.round))) return nextMatch.round;
  return "";
}

function parsePublicMatchDateTime(match) {
  const date = parsePublicDate(match?.date);
  const [hours, minutes] = String(match?.time || "23:59").split(":").map(Number);
  date.setHours(Number.isFinite(hours) ? hours : 23, Number.isFinite(minutes) ? minutes : 59, 0, 0);
  return date;
}

function groupPublicMatchesByDay(matches) {
  const sortedMatches = [...matches].sort((a, b) => (
    Number(!a.date) - Number(!b.date) ||
    String(a.date || "").localeCompare(String(b.date || "")) ||
    String(a.time || "").localeCompare(String(b.time || "")) ||
    String(a.venue || "").localeCompare(String(b.venue || ""))
  ));
  const groups = new Map();
  for (const match of sortedMatches) {
    const id = match.date || "por-definir";
    if (!groups.has(id)) groups.set(id, { id, matches: [], ...getPublicMatchDayCopy(match.date) });
    groups.get(id).matches.push(match);
  }
  return [...groups.values()];
}

function groupPublicMatchesByVenue(matches) {
  const sortedMatches = [...matches].sort((a, b) => (
    String(a.venue || "zzz").localeCompare(String(b.venue || "zzz")) ||
    Number(!a.date) - Number(!b.date) ||
    String(a.date || "").localeCompare(String(b.date || "")) ||
    String(a.time || "").localeCompare(String(b.time || ""))
  ));
  const groups = new Map();
  for (const match of sortedMatches) {
    const title = match.venue || "Cancha por definir";
    const id = `venue-${normalizeSearchTerm(title) || "sin-cancha"}`;
    if (!groups.has(id)) {
      groups.set(id, {
        id,
        matches: [],
        title,
        subtitle: "Partidos por cancha"
      });
    }
    groups.get(id).matches.push(match);
  }
  return [...groups.values()];
}

function getPublicMatchDayCopy(value) {
  if (!value) return { title: "Fecha por definir", subtitle: "Horario pendiente" };
  const date = parsePublicDate(value);
  return {
    title: new Intl.DateTimeFormat("es-MX", { weekday: "long" }).format(date).toLocaleUpperCase("es-MX"),
    subtitle: new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "long", year: "numeric" }).format(date).toLocaleUpperCase("es-MX")
  };
}

function getPublicRoundDateRange(groups) {
  const datedGroups = groups.filter((group) => group.id !== "por-definir");
  if (!datedGroups.length) return "Fechas por definir";
  const dates = datedGroups.map((group) => parsePublicDate(group.id)).sort((a, b) => a - b);
  const first = dates[0];
  const last = dates.at(-1);
  const monthYear = new Intl.DateTimeFormat("es-MX", { month: "short", year: "numeric" }).format(last).toLocaleUpperCase("es-MX");
  if (first.toDateString() === last.toDateString()) {
    return new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", year: "numeric" }).format(first).toLocaleUpperCase("es-MX");
  }
  return `${String(first.getDate()).padStart(2, "0")} - ${String(last.getDate()).padStart(2, "0")} ${monthYear}`;
}

function parsePublicDate(value) {
  const [year, month, day] = String(value || "").split("-").map(Number);
  return new Date(year || 2000, (month || 1) - 1, day || 1, 12, 0, 0);
}

function getMatchDateParts(value) {
  if (!value) return { day: "--", month: "Fecha" };
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return { day: "--", month: "Fecha" };
  const months = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
  const monthIndex = Math.max(0, Math.min(11, Number(match[2]) - 1));
  return {
    day: String(Number(match[3])).padStart(2, "0"),
    month: months[monthIndex]
  };
}

function MatchCard({ focused = false, league, match, onSelectMatch }) {
  const isFinished = match.status === "finished" || match.status === "walkover";
  const isPostponed = match.status === "postponed";
  const isScheduleChanged = ["postponed", "rescheduled", "advanced"].includes(match.status || "");
  const timeLabel = match.time ? `${match.time} hrs` : "Hora por definir";
  const timeOrScore = isFinished ? `${match.homeGoals ?? 0} - ${match.awayGoals ?? 0}` : isPostponed ? "POSP." : "VS";
  const dateParts = getMatchDateParts(match.date);
  const homeTeam = getTeam(league, match.homeTeamId);
  const awayTeam = getTeam(league, match.awayTeamId);
  const statusLabel = getMatchStatusLabel(match);
  const isPlayoff = (match.stage || "regular") === "playoff";
  const tiebreakerRows = getMatchTiebreakerRows(match);
  const canOpenPublicDetail = isFinished && typeof onSelectMatch === "function";

  function handleDetailTrigger(event) {
    if (!canOpenPublicDetail) return;
    event.preventDefault();
    event.stopPropagation();
    onSelectMatch(match.id);
  }

  function handleDetailTriggerKeyDown(event) {
    if (event.key !== "Enter" && event.key !== " ") return;
    handleDetailTrigger(event);
  }

  return (
    <article
      className={`match-card ${focused ? "is-search-focused" : ""} ${isFinished ? "is-finished" : "is-scheduled"} ${isScheduleChanged ? "has-schedule-note" : ""} ${match.status ? `status-${match.status}` : ""}`}
      data-public-match-id={match.id}
    >
      <div className="match-card-face">
        <div className="match-card-date" aria-label={match.date ? formatDate(match.date) : "Fecha por definir"}>
          <MatchMetaIcon type="calendar" />
          <strong>{dateParts.day}</strong>
          <span>{dateParts.month}</span>
          <b>{timeLabel}</b>
        </div>
        <div className="match-card-main">
          <div className="match-card-kicker">
            <span><MatchMetaIcon type="venue" />{match.venue || "Cancha por definir"}</span>
            {isPlayoff && <span>{match.playoffRound || "Liguilla"}</span>}
          </div>
          <div className="match-card-scoreline">
            <div className="match-card-team home">
              <TeamMark team={homeTeam} className="match-card-crest" />
              <strong>{homeTeam?.name || "LOCAL"}</strong>
            </div>
            <div className="match-card-center">
              <strong>{timeOrScore}</strong>
              {!isScheduleChanged && <small>{statusLabel}</small>}
              {isFinished && tiebreakerRows.length > 0 && (
                <small>{tiebreakerRows.map((row) => `${row.label} ${row.value}`).join(" | ")}</small>
              )}
            </div>
            <div className="match-card-team away">
              <TeamMark team={awayTeam} className="match-card-crest" />
              <strong>{awayTeam?.name || "VISITANTE"}</strong>
            </div>
          </div>
        </div>
        <div
          className="match-card-action"
          aria-label={isFinished ? "Toca para ver goles" : "Partido programado"}
          data-match-detail-trigger={canOpenPublicDetail ? "true" : undefined}
          onClick={canOpenPublicDetail ? handleDetailTrigger : undefined}
          onKeyDown={canOpenPublicDetail ? handleDetailTriggerKeyDown : undefined}
          role={canOpenPublicDetail ? "button" : undefined}
          tabIndex={canOpenPublicDetail ? 0 : undefined}
        >
          {isFinished ? (
            <>
              <MatchMetaIcon type="ball" />
              <strong>Ver goles</strong>
            </>
          ) : (
            <>
              <MatchMetaIcon type="time" />
              <strong>{isScheduleChanged ? "Aviso" : statusLabel}</strong>
            </>
          )}
          <span>{isPlayoff ? match.playoffRound || "Liguilla" : `J${match.round || "-"}`}</span>
        </div>
        {!isScheduleChanged && (
          <div className="match-card-mobile-meta">
            <span className={`status ${match.status}`}>{statusLabel}</span>
            {isFinished ? (
              <span
                className="match-touch-hint"
                data-match-detail-trigger={canOpenPublicDetail ? "true" : undefined}
                onClick={canOpenPublicDetail ? handleDetailTrigger : undefined}
                onKeyDown={canOpenPublicDetail ? handleDetailTriggerKeyDown : undefined}
                role={canOpenPublicDetail ? "button" : undefined}
                tabIndex={canOpenPublicDetail ? 0 : undefined}
              >
                <MatchMetaIcon type="ball" />Ver goles
              </span>
            ) : (
              <span><MatchMetaIcon type="time" />{statusLabel}</span>
            )}
          </div>
        )}
        {isScheduleChanged && (
          <p className="match-schedule-note">
            <MatchMetaIcon type="time" />
            <span>{statusLabel}</span>
            {match.scheduleNote || (match.status === "postponed" ? "Pendiente de nueva fecha." : match.status === "advanced" ? "Partido adelantado por la liga." : "Partido reprogramado por la liga.")}
          </p>
        )}
      </div>
    </article>
  );
}

function MatchMetaIcon({ type }) {
  if (type === "filter") {
    return (
      <svg className="match-card-meta-icon" aria-hidden="true" viewBox="0 0 24 24">
        <path d="M4 6h16M7 12h10M10 18h4" />
      </svg>
    );
  }
  if (type === "calendar") {
    return (
      <svg className="match-card-meta-icon" aria-hidden="true" viewBox="0 0 24 24">
        <rect x="4" y="5" width="16" height="15" rx="2.5" />
        <path d="M8 3.5v4" />
        <path d="M16 3.5v4" />
        <path d="M4 10h16" />
        <path d="m9 15 2 2 4-5" />
      </svg>
    );
  }

  if (type === "ball") {
    return (
      <svg className="match-card-meta-icon" aria-hidden="true" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="8.5" />
        <path d="m12 7.2 4.1 3-1.55 4.8h-5.1L7.9 10.2Z" />
        <path d="M12 7.2V3.6" />
        <path d="m16.1 10.2 3.4-1.1" />
        <path d="m14.55 15 2.1 2.9" />
        <path d="m9.45 15-2.1 2.9" />
        <path d="M7.9 10.2 4.5 9.1" />
      </svg>
    );
  }

  if (type === "venue") {
    return (
      <svg className="match-card-meta-icon" aria-hidden="true" viewBox="0 0 24 24">
        <rect x="3" y="5" width="18" height="14" rx="2.5" />
        <path d="M12 5v14" />
        <circle cx="12" cy="12" r="2.5" />
        <path d="M3 9h3.2v6H3" />
        <path d="M21 9h-3.2v6H21" />
      </svg>
    );
  }

  return (
    <svg className="match-card-meta-icon" aria-hidden="true" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.4v5.1l3.4 2" />
    </svg>
  );
}

function MatchEventSummary({ league, match, homeTeam, awayTeam }) {
  const events = sortMatchEvents(match.events || []);
  const homeEvents = events.filter((event) => event.teamId === match.homeTeamId);
  const awayEvents = events.filter((event) => event.teamId === match.awayTeamId);

  if (!events.length) {
    return (
      <div className="match-events-empty">
        <strong>Detalle del partido</strong>
        <span>Aun no hay goles o tarjetas capturadas en el acta.</span>
      </div>
    );
  }

  return (
    <div className="match-event-detail compact-sided-events">
      <div className="match-event-compact-head">
        <strong>{homeTeam?.name || "LOCAL"}</strong>
        <span aria-hidden="true" />
        <strong>{awayTeam?.name || "VISITANTE"}</strong>
      </div>
      <div className="match-event-compact-grid">
        <CompactTeamEvents events={homeEvents} league={league} side="home" />
        <span className="match-event-compact-divider" aria-hidden="true" />
        <CompactTeamEvents events={awayEvents} league={league} side="away" />
      </div>
    </div>
  );
}

function CompactTeamEvents({ events, league, side }) {
  return (
    <div className={`match-compact-team-events ${side}`}>
      {events.map((event, index) => {
        const player = getPlayer(league, event.playerId);
        return (
          <article className={`match-compact-event ${event.type}`} key={`${event.type}-${event.playerId}-${event.minute}-${index}`}>
            <span className="match-compact-event-icon" aria-hidden="true">{getPublicEventIcon(event.type)}</span>
            <div>
              <strong>{player?.name || `Jugador ${index + 1}`}</strong>
              <small>
                {hasEventMinute(event) && <b>{getEventMinuteLabel(event)}'</b>}
                <span>{getPublicEventDetail(event)}</span>
              </small>
            </div>
          </article>
        );
      })}
      {!events.length && <p>Sin eventos</p>}
    </div>
  );
}

function hasEventMinute(event) {
  return parseEventMinute(event) !== null;
}

function parseEventMinute(event) {
  const value = event.minute ?? "";
  if (value === "" || value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isNaN(numeric) ? null : numeric;
}

function getEventMinuteLabel(event) {
  return event.minuteLabel || event.minute;
}

function isFirstHalfMinute(event) {
  const label = String(event.minuteLabel || "");
  const minute = parseEventMinute(event);
  return /^45\s*\+/.test(label) || (minute !== null && minute <= 45);
}

function isSecondHalfMinute(event) {
  const label = String(event.minuteLabel || "");
  const minute = parseEventMinute(event);
  return !/^45\s*\+/.test(label) && minute !== null && minute > 45;
}

function isExtraTimeEvent(event) {
  if (String(event.period || "") === "extra_time") return true;
  const minute = parseEventMinute(event);
  return minute !== null && minute > 90;
}

function getEventPhase(event) {
  return isExtraTimeEvent(event) ? "extra_time" : "regular";
}

function getEventPhaseLabel(phase) {
  if (phase === "extra_time") return "Tiempo extra";
  return "Tiempo regular";
}

function sortMatchEvents(events) {
  const indexedEvents = events
    .filter((event) => ["goal", "own_goal", "yellow", "red"].includes(event.type))
    .map((event, index) => ({ event, index }));
  const hasMinutes = indexedEvents.some(({ event }) => hasEventMinute(event));

  if (!hasMinutes) return indexedEvents.map(({ event }) => event);

  return indexedEvents
    .sort((left, right) => {
      const leftHasMinute = hasEventMinute(left.event);
      const rightHasMinute = hasEventMinute(right.event);
      if (leftHasMinute && rightHasMinute) {
        return parseEventMinute(left.event) - parseEventMinute(right.event) || left.index - right.index;
      }
      if (leftHasMinute) return -1;
      if (rightHasMinute) return 1;
      return left.index - right.index;
    })
    .map(({ event }) => event);
}

function MatchEventTimeline({ league, match, events, homeTeam, awayTeam }) {
  const hasFirstHalf = events.some((event) => hasEventMinute(event) && isFirstHalfMinute(event));
  const hasSecondHalf = events.some((event) => hasEventMinute(event) && isSecondHalfMinute(event));
  const showHalfTime = hasFirstHalf && hasSecondHalf;
  const showEventPhases = events.some((event) => getEventPhase(event) === "extra_time");
  const rows = [];
  let halfTimeInserted = false;
  let activePhase = "";

  for (const [index, event] of events.entries()) {
    const eventPhase = getEventPhase(event);
    if (showEventPhases && eventPhase !== activePhase) {
      activePhase = eventPhase;
      rows.push(
        <div className={`match-timeline-half phase-${eventPhase}`} key={`phase-${eventPhase}`}>
          <span aria-hidden="true">{eventPhase === "extra_time" ? "+" : "◷"}</span>
          <strong>{getEventPhaseLabel(eventPhase)}</strong>
        </div>
      );
    }
    if (eventPhase === "regular" && showHalfTime && !halfTimeInserted && hasEventMinute(event) && isSecondHalfMinute(event)) {
      halfTimeInserted = true;
      rows.push(
        <div className="match-timeline-half" key="half-time">
          <span aria-hidden="true">◷</span>
          <strong>Medio tiempo</strong>
        </div>
      );
    }
    rows.push(<MatchTimelineEvent event={event} index={index} key={`${event.type}-${event.playerId}-${event.minute}-${index}`} league={league} match={match} />);
  }

  return (
    <div className="match-events-timeline">
      <div className="match-timeline-teams">
        <strong>{homeTeam?.name || "LOCAL"}</strong>
        <strong>{awayTeam?.name || "VISITANTE"}</strong>
      </div>
      <div className="match-timeline-list">
        {rows}
      </div>
      <p className="match-timeline-note">Los tiempos corresponden al tiempo oficial capturado en el acta.</p>
    </div>
  );
}

function MatchTimelineEvent({ league, match, event, index }) {
  const player = getPlayer(league, event.playerId);
  const side = event.teamId === match.awayTeamId ? "away" : "home";

  return (
    <article className={`match-timeline-event ${side} ${event.type}`}>
      <span className="match-timeline-minute">{hasEventMinute(event) ? `${getEventMinuteLabel(event)}'` : ""}</span>
      <div className="match-timeline-card">
        <span className="match-timeline-icon" aria-hidden="true">{getPublicEventIcon(event.type)}</span>
        <div>
          <strong>{player?.name || `Jugador ${index + 1}`}</strong>
          <small>{getPublicEventDetail(event)}</small>
        </div>
      </div>
    </article>
  );
}

function MatchTeamEvents({ title, events, league, showMinutes = true }) {
  return (
    <div className="match-team-events">
      <strong>{title}</strong>
      {events.map((event, index) => {
        const player = getPlayer(league, event.playerId);
        return (
          <article className={`match-event-row ${event.type} ${showMinutes ? "" : "without-minute"}`} key={`${event.type}-${event.playerId}-${event.minute}-${index}`}>
            {showMinutes && <span className="match-event-minute">{event.minute ? `${getEventMinuteLabel(event)}'` : ""}</span>}
            <span className="match-event-badge">{getPublicEventIcon(event.type)}</span>
            <div>
              <strong>{player?.name || "Jugador"}</strong>
              <small>{getPublicEventDetail(event)}</small>
            </div>
          </article>
        );
      })}
      {!events.length && <p>Sin eventos registrados para este equipo.</p>}
    </div>
  );
}

function getPublicEventIcon(type) {
  if (type === "goal") return "⚽";
  if (type === "own_goal") return "↩";
  if (type === "yellow") return "🟨";
  if (type === "red") return "🟥";
  return "•";
}

function getPublicEventDetail(event) {
  if (event.type === "goal") return "Gol";
  if (event.type === "own_goal") return "Autogol";
  if (event.type === "yellow") return "Amarilla";
  if (event.type === "red") return event.reason || "Roja";
  return "Evento";
}

function MatchVersus({ league, match }) {
  const home = getTeam(league, match.homeTeamId);
  const away = getTeam(league, match.awayTeamId);

  return (
    <div className="versus-line">
      <strong><TeamMark team={home} className="versus-crest" />{home?.name || "LOCAL"}</strong>
      <span>VS</span>
      <strong><TeamMark team={away} className="versus-crest" />{away?.name || "VISITANTE"}</strong>
    </div>
  );
}

function MatchScore({ match }) {
  if (match.status !== "finished" && match.status !== "walkover") return null;

  return (
    <div className="match-profile-score" aria-label="Marcador final">
      <strong>{match.homeGoals ?? 0}</strong>
      <span>-</span>
      <strong>{match.awayGoals ?? 0}</strong>
    </div>
  );
}

function MatchMeta({ match }) {
  return (
    <div className="match-meta">
      <span>{match.date ? formatDate(match.date) : "FECHA POR DEFINIR"}</span>
      <span>{match.time || "HORA POR DEFINIR"}</span>
      <span>{match.venue || "CANCHA POR DEFINIR"}</span>
    </div>
  );
}

function Scorers({ rows, onSelectPlayer }) {
  if (!rows.length) return <p className="empty empty-polished">Aun no hay goles registrados. El ranking aparecera cuando se capturen las actas finalizadas.</p>;

  return (
    <ol className="ranking-list">
      {rows.map((row, index) => (
        <li className={index < 3 ? `top-scorer rank-${index + 1}` : ""} key={row.player.id}>
          <a
            className="scorer-row-button"
            href="#jugador"
            onClick={() => onSelectPlayer(row.player.id)}
          >
            <span className="scorer-rank">{index + 1}</span>
            <PlayerAvatar player={row.player} className="scorer-avatar" />
            <span className="scorer-player">
              <strong>{row.player.name}</strong>
              <small><TeamMark team={row.team} className="scorer-team-mark" />{row.team?.name || "Sin equipo"}</small>
            </span>
            <strong className="scorer-goals"><span>{row.goals}</span><small>goles</small></strong>
          </a>
        </li>
      ))}
    </ol>
  );
}

function SponsorBanners({ league, fallback }) {
  const sponsors = [...(league.sponsors || [])]
    .filter((sponsor) => (sponsor.status || "active") === "active" && sponsor.imageUrl)
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || a.name.localeCompare(b.name));

  if (!sponsors.length) {
    return (
      <div className="sponsor-empty">
        <strong>{fallback || "Espacio disponible para tu marca"}</strong>
        <span>Tu negocio puede aparecer aqui durante toda la jornada.</span>
      </div>
    );
  }
  const displaySponsors = sponsors.length > 1 ? [...sponsors, ...sponsors] : sponsors;

  return (
    <div className={`sponsor-public-strip ${sponsors.length > 1 ? "is-carousel" : ""}`}>
      <div className="sponsor-public-track">
      {displaySponsors.map((sponsor, index) => {
        const image = (
          <>
            <div className="sponsor-image-frame">
              <img alt={sponsor.name} src={sponsor.imageUrl} />
            </div>
            <span>{sponsor.name}</span>
          </>
        );
        return sponsor.linkUrl ? (
          <a href={sponsor.linkUrl} key={`${sponsor.id}-${index}`} rel="noreferrer" target="_blank">{image}</a>
        ) : (
          <article key={`${sponsor.id}-${index}`}>{image}</article>
        );
      })}
      </div>
    </div>
  );
}

function SuspensionNotices({ notices }) {
  if (!notices.length) return <p className="empty">No hay jugadores suspendidos para la siguiente jornada.</p>;

  return (
    <div className="suspension-notice-list">
      {notices.map((notice) => (
        <article className={`suspension-notice ${notice.status}`} key={notice.id}>
          <strong>{notice.player.name}</strong>
          <span>{notice.team?.name || "Sin equipo"}</span>
          {notice.pendingReview ? (
            <p>Expulsado y sujeto a revision por comision disciplinaria. No puede ser alineado hasta resolucion.</p>
          ) : notice.indefinite ? (
            <p>{notice.type === "Expulsion" ? "Expulsado" : "Suspendido"} con inhabilitacion indefinida hasta resolucion de la liga.</p>
          ) : (
            <p>
              {notice.type === "Expulsion" ? "Expulsado" : "Suspendido"} por {notice.totalMatches} partido(s). Le restan {notice.remainingMatches} juego(s) de suspension.
              {notice.returnRound ? ` Podra regresar en la jornada ${notice.returnRound}.` : ""}
            </p>
          )}
          <small>{notice.reason}</small>
        </article>
      ))}
    </div>
  );
}

function InjurySupportList({ league, injuries }) {
  if (!injuries.length) return <p className="empty">No hay lesiones activas registradas.</p>;

  return (
    <div className="injury-public-list">
      {injuries.map((injury) => {
        const player = league.players.find((item) => item.id === injury.playerId);
        const team = player ? getTeam(league, player.teamId) : null;

        return (
          <article className="injury-public-card" key={injury.id}>
            <div>
              <strong>{player?.name || "Jugador"}</strong>
              <span>{team?.name || "Sin equipo"}</span>
            </div>
            <p>{injury.type}</p>
            <div className="injury-tags">
              {injury.needsSurgery && <span>Requiere operacion</span>}
              {injury.needsSupport && <span>Necesita apoyo</span>}
              {injury.expectedReturn && <span>Regreso estimado {formatDate(injury.expectedReturn)}</span>}
            </div>
            {injury.supportDetail && <small>{injury.supportDetail}</small>}
            {injury.notes && <small>{injury.notes}</small>}
          </article>
        );
      })}
    </div>
  );
}

function Discipline({ rows }) {
  if (!rows.length) return <p className="empty">Sin amarillas vigentes registradas.</p>;

  return (
    <div className="discipline-list">
      {rows.map((row) => (
        <article className={row.status} key={row.player.id}>
          <div className="discipline-player">
            <strong>{row.player.name}</strong>
            <span>Equipo: {row.team?.name || "Sin equipo"}</span>
          </div>
          <div className="yellow-card-progress" aria-label={`${row.yellowCards} de ${row.yellowLimit} amarillas`}>
            <strong>{row.yellowCards}/{row.yellowLimit}</strong>
          </div>
          <small>{row.message}</small>
        </article>
      ))}
    </div>
  );
}

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import alpLogo from "../../assets/alp-logo.png";
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

function saveLastCompetitionId(leagueId, competitionId) {
  try {
    if (leagueId && competitionId) localStorage.setItem(getPublicCompetitionStorageKey(leagueId), competitionId);
  } catch {
    // Preferencia publica opcional; si el navegador no deja guardar, la app sigue funcionando.
  }
}

const COMPETITION_ACCENTS = ["#28a85a", "#1368d8", "#f97316", "#a855f7", "#eab308", "#0f9ca5", "#dc2626", "#0891b2"];

function getCompetitionAccent(competitions, competitionId) {
  const index = Math.max(0, competitions.findIndex((competition) => competition.id === competitionId));
  return COMPETITION_ACCENTS[index % COMPETITION_ACCENTS.length];
}

function getPublicCompetitions(league) {
  return (league.competitions || []).filter((competition) => !["archived", "hidden"].includes(competition.status));
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
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [selectedCompetitionId, setSelectedCompetitionId] = useState(() => loadLastCompetitionId(league) || getDefaultCompetitionId(league));
  const [isCompetitionSheetOpen, setCompetitionSheetOpen] = useState(false);
  const [showCompetitionGate, setShowCompetitionGate] = useState(() => (
    hasTournamentSelector(league)
  ));
  const activeLeague = useMemo(
    () => scopeLeagueToCompetition(league, selectedCompetitionId),
    [league, selectedCompetitionId]
  );
  const regularLeague = useMemo(() => ({ ...activeLeague, matches: regularMatches(activeLeague) }), [activeLeague]);
  const playoffs = useMemo(() => playoffMatches(activeLeague), [activeLeague]);
  const activeCompetition = getCompetition(league, selectedCompetitionId);
  const competitionAccent = getCompetitionAccent(league.competitions || [], selectedCompetitionId);
  const publicCompetitions = getPublicCompetitions(league);
  const archivedPublicCompetitions = getArchivedPublicCompetitions(league);
  const hasMultipleCompetitions = publicCompetitions.length > 1;
  const [selectedSeason, setSelectedSeason] = useState(activeCompetition?.season || league.season);
  const standings = calculateStandings(regularLeague);
  const stats = calculatePlayerStats(activeLeague);
  const leagueWideStats = useMemo(() => calculatePlayerStats(league), [league]);
  const scheduledMatches = sortPublicMatches(regularLeague.matches.filter(isPublicScheduledMatch));
  const nextMatches = scheduledMatches.slice(0, 4);
  const latestResults = sortRecentMatches(finishedMatches(regularLeague)).slice(0, 3);
  const featuredMatch = getFeaturedPublicMatch(regularLeague, standings);
  const disciplineLeague = league.rules?.disciplineScope === "league" ? league : activeLeague;
  const rounds = useMemo(() => (
    [...new Set(regularLeague.matches.map((match) => Number(match.round || 0)).filter(Boolean))]
      .sort((a, b) => a - b)
  ), [regularLeague.matches]);
  const defaultRound = useMemo(() => (
    getCurrentDisplayRound(regularLeague.matches) ||
    (activeCompetition?.activeRound && rounds.includes(Number(activeCompetition.activeRound))
      ? activeCompetition.activeRound
      : "") ||
    rounds.at(-1) ||
    ""
  ), [activeCompetition?.activeRound, regularLeague.matches, rounds]);
  const [selectedRound, setSelectedRound] = useState(defaultRound);
  const selectedRoundMatches = useMemo(() => (
    regularLeague.matches
      .filter((match) => Number(match.round) === Number(selectedRound))
      .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.time).localeCompare(String(b.time)))
  ), [regularLeague.matches, selectedRound]);
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

  function selectPublicPlayer(playerId) {
    setSelectedPlayerId(playerId);
    window.requestAnimationFrame(() => {
      document.getElementById("jugador")?.scrollIntoView({ behavior: "smooth", block: "start" });
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
    if (result.type === "team") setSelectedTeamId(result.id);
    if (result.type === "player") setSelectedPlayerId(result.id);
    if (result.type === "match" && result.round) setSelectedRound(result.round);
    setPublicSearch("");
    window.requestAnimationFrame(() => {
      const targetId = result.type === "player" ? "jugador" : result.type === "team" ? "equipos" : "calendario";
      document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  useEffect(() => {
    const timer = window.setTimeout(() => setShowIntro(false), 520);
    return () => window.clearTimeout(timer);
  }, []);

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
    const shouldShowGate = hasTournamentSelector(league);
    if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
    setShowCompetitionGate(shouldShowGate);
    if (shouldShowGate) {
      clearPublicHash();
      forcePublicScrollTop();
    }
  }, [league.id]);

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

  return (
    <main className="page public-league-page" style={{ "--competition-accent": competitionAccent }}>
      {showIntro && <PublicLoading league={league} />}
      <section className="hero public-hero" id="inicio" style={{ "--hero-image": `url(${heroImage})` }}>
        <div className="hero-content">
          <span className="eyebrow">
            {league.city} | {league.season}
          </span>
          <h1>{league.name}</h1>
          <p className="hero-tagline">La evolucion digital de tu liga.</p>
          <p>{league.identity.publicIntro}</p>
          <div className="hero-actions">
            <a href="#calendario" className="primary">Ver calendario</a>
            <a href="#tabla" className="secondary">Tabla general</a>
          </div>
        </div>
        <HeroMatchPanel league={activeLeague} match={featuredMatch} standings={standings} />
      </section>

      <PublicCompetitionDock
        activeCompetition={activeCompetition}
        competitions={publicCompetitions}
        league={activeLeague}
        onOpen={() => setCompetitionSheetOpen(true)}
        visible={hasMultipleCompetitions}
      />

      <PublicQuickNav />

      {league.status === "suspended" && (
        <section className="suspension-banner">
          <strong>Liga suspendida temporalmente</strong>
          <span>La informacion puede mostrarse limitada hasta que la liga sea reactivada por un administrador.</span>
        </section>
      )}

      {identityTags.length > 0 && (
        <section className="identity-strip" aria-label="Identidad de liga">
          {identityTags.map((tag) => <span key={tag}>{tag}</span>)}
        </section>
      )}

      <PublicUtilityBar
        leagueName={league.name}
        onSearch={setPublicSearch}
        onSelectResult={handlePublicSearchResult}
        onShare={shareLeague}
        query={publicSearch}
        results={publicSearchResults}
      />

      <PublicPulseBar
        league={regularLeague}
        roundMatches={selectedRoundMatches}
        standings={standings}
      />

      <SpotlightStrip spotlights={spotlights} />

      {activeAnnouncements.length > 0 && (
        <section className="panel announcement-public-panel">
          <SectionHeading eyebrow="Avisos" title="Comunicados de la liga" />
          <div className="announcement-public-list">
            {activeAnnouncements.map((announcement) => (
              <article key={announcement.id}>
                <div>
                  <strong>{announcement.title}</strong>
                  {announcement.date && <time dateTime={announcement.date}>{formatDate(announcement.date)}</time>}
                </div>
                <p>{announcement.body}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="content-grid">
        <div className="main-column">
          <section className="panel standings-panel" id="tabla">
            <StandingsTable
              rows={standings}
              rules={activeLeague.rules}
              league={activeLeague}
              competition={activeCompetition}
              onShare={() => shareStandingsCard({ league, competition: activeCompetition, standings })}
            />
          </section>

          <section className="panel" id="calendario">
            <SectionHeading eyebrow="Jornada" title="Partidos" />
            <RoundSelector rounds={rounds} selectedRound={selectedRound} onSelectRound={setSelectedRound} />
            <div className="round-summary">
              <strong>Jornada {selectedRound || "-"}</strong>
              <span>{selectedRoundMatches.length} partido(s)</span>
            </div>
            {!!selectedRoundMatches.length && (
              <ShareActionButton
                label="Compartir jornada"
                onClick={() => shareRoundCard({ league: activeLeague, selectedRound, matches: selectedRoundMatches })}
              />
            )}
            <div className="match-list">
              {selectedRoundMatches.map((match) => <MatchCard key={match.id} league={activeLeague} match={match} />)}
              <RestingTeams teams={restingTeams} />
              {!selectedRoundMatches.length && <p className="empty">Aun no hay partidos programados en esta jornada.</p>}
            </div>
          </section>

          {!!playoffs.length && (
            <section className="panel" id="liguilla">
              <SectionHeading eyebrow="Fase final" title="Liguilla" />
              <PlayoffList league={activeLeague} matches={playoffs} />
            </section>
          )}

          <section className="panel" id="equipos">
            <SectionHeading eyebrow="Clubes" title="Perfil de equipo" />
            <TeamProfile
              league={league}
              activeLeague={activeLeague}
              standings={standings}
              stats={stats}
              onSelectPlayer={selectPublicPlayer}
              selectedTeam={selectedTeam}
              selectedTeamId={selectedTeamId}
              onSelectTeam={setSelectedTeamId}
            />
          </section>

          <section className="panel" id="jugador">
            <SectionHeading eyebrow="Jugador" title="Ficha publica" />
            <PlayerPublicCard
              league={activeLeague}
              seasonLeague={league}
              player={selectedPlayer}
              stats={stats}
              onSelectTeam={setSelectedTeamId}
            />
          </section>
        </div>

        <aside className="side-column" id="mas">
          <section className="panel">
            <SectionHeading eyebrow="Portada" title="Destacados" />
            <ul className="highlight-list">
              {highlights.map((item) => <li key={item}>{item}</li>)}
            </ul>
            {!highlights.length && <p className="empty">Aun no hay destacados para este torneo.</p>}
          </section>

          <section className="ad-slot">
            <div className="ad-slot-head">
              <span>Patrocinadores oficiales</span>
              <strong>Marcas que impulsan la liga</strong>
            </div>
            <SponsorBanners league={activeLeague} fallback={league.adBanner} />
          </section>

          <section className="panel" id="goleo">
            <SectionHeading eyebrow="Individual" title="Goleadores" />
            <ShareActionButton
              className="compact-share-button"
              label="Compartir"
              onClick={() => shareScorersCard({ league: activeLeague, competition: activeCompetition, scorers: allScorers })}
            />
            <Scorers rows={scorers} onSelectPlayer={selectPublicPlayer} />
          </section>

          <section className="panel">
            <SectionHeading eyebrow="Siguiente jornada" title="Expulsados y regresos" />
            <ShareActionButton
              className="compact-share-button"
              label="Compartir"
              onClick={() => shareSuspensionsCard({ league: activeLeague, competition: activeCompetition, notices: suspensionNotices })}
            />
            <SuspensionNotices league={activeLeague} notices={suspensionNotices} />
          </section>

          <section className="panel">
            <SectionHeading eyebrow="Apoyo" title="Lesionados" />
            <InjurySupportList league={activeLeague} injuries={activeInjuries} />
          </section>

          <section className="panel">
            <SectionHeading eyebrow="Control" title="Disciplina" />
            <ShareActionButton
              className="compact-share-button"
              label="Compartir amarillas"
              onClick={() => shareYellowCardsCard({ league: disciplineLeague, competition: activeCompetition, rows: discipline })}
            />
            <Discipline league={disciplineLeague} rows={discipline} />
          </section>

          <section className="panel">
            <SectionHeading eyebrow="Reconocimiento" title="Juego limpio" />
            <FairPlayTeams rows={fairPlayTeams} />
          </section>
        </aside>
      </section>

      <PublicLegalFooter legalPath={legalPath} league={league} onNavigate={onNavigate} />
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
  function handleLegalClick(event) {
    if (!onNavigate) return;
    event.preventDefault();
    onNavigate(legalPath);
  }

  return (
    <footer className="public-legal-footer">
      <div>
        <strong>{league.name}</strong>
        <span>Derechos reservados. Informacion sujeta a revision de la liga.</span>
      </div>
      <a href={legalPath} onClick={handleLegalClick}>Terminos, privacidad y copyright</a>
    </footer>
  );
}

function isSetupHighlight(item) {
  return /liga creada.*agrega equipos.*jugadores.*calendario/i.test(String(item || ""));
}

function PublicLoading({ league }) {
  return (
    <div className="public-loading" role="status" aria-label="Cargando liga">
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
            <span>Selecciona un torneo</span>
            <strong>{league.name}</strong>
          </div>
          <button type="button" aria-label="Cerrar selector de torneo" onClick={onClose}>X</button>
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
    .filter((team) => normalizeSearchTerm(team.name).includes(term))
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
    .filter((player) => normalizeSearchTerm(player.name).includes(term))
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
      return [home, away, match.venue, `jornada ${match.round || ""}`]
        .some((value) => normalizeSearchTerm(value).includes(term));
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
  const shareText = url || text || "";
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
      ? `Imagen copiada. Pega la imagen en WhatsApp y agrega este link en el texto:\n\n${shareText}`
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
  const scheduled = sortPublicMatchesByRound(league.matches.filter(isPublicScheduledMatch));
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

function PublicQuickNav() {
  const [activeHref, setActiveHref] = useState(() => (typeof window === "undefined" ? "#inicio" : window.location.hash || "#inicio"));
  const links = [
    { href: "#inicio", label: "Inicio", icon: "home" },
    { href: "#calendario", label: "Partidos", icon: "matches" },
    { href: "#tabla", label: "Tabla", icon: "table" },
    { href: "#goleo", label: "Goleo", icon: "scoring" },
    { href: "#mas", label: "Mas", icon: "more" }
  ];

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const updateActiveHref = () => setActiveHref(window.location.hash || "#inicio");
    updateActiveHref();
    window.addEventListener("hashchange", updateActiveHref);
    return () => window.removeEventListener("hashchange", updateActiveHref);
  }, []);

  return (
    <nav className="public-quick-nav" aria-label="Navegacion publica">
      {links.map((link) => (
        <a
          aria-current={activeHref === link.href ? "page" : undefined}
          className={activeHref === link.href ? "active" : ""}
          href={link.href}
          key={link.href}
          onClick={() => setActiveHref(link.href)}
        >
          <span className="quick-nav-icon" aria-hidden="true"><PublicNavIcon type={link.icon} /></span>
          <span>{link.label}</span>
        </a>
      ))}
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

  return (
    <svg viewBox="0 0 24 24" role="img">
      <path d="M6 8h12M6 12h12M6 16h12" />
      <path d="M4 8h.1M4 12h.1M4 16h.1" />
    </svg>
  );
}

function PublicUtilityBar({ leagueName, onSearch, onSelectResult, onShare, query, results }) {
  return (
    <section className="public-utility-bar" aria-label="Herramientas publicas">
      <label className="public-search-box">
        <span>Buscar equipo o jugador</span>
        <input
          type="search"
          value={query}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Ej. Club Costa, Daniel..."
        />
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
              <strong>{result.name}</strong>
              <span>{result.detail}</span>
              {result.competitionId && !result.isCurrentCompetition && <small>Ver en su torneo</small>}
            </a>
          ))}
          {!results.length && <p>Sin resultados para {leagueName}.</p>}
        </div>
      )}
    </section>
  );
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
      <span className="whatsapp-icon" aria-hidden="true">W</span>
      {isSharing ? "Generando imagen..." : label}
    </button>
  );
}

function PublicHomeDashboard({ league, latestResults, nextMatches, standings, currentRound, stats }) {
  const finishedCount = finishedMatches(league).length;
  const programmedCount = league.matches.filter(isPublicScheduledMatch).length;
  const leader = standings[0];
  const topScorer = [...stats].sort((a, b) => b.goals - a.goals || a.player.name.localeCompare(b.player.name))[0];
  const quickLinks = [
    { href: "#calendario", label: "Partidos", meta: `${programmedCount} programado(s)` },
    { href: "#tabla", label: "Tabla general", meta: leader ? `${leader.team.name} lidera` : "Por iniciar" },
    { href: "#goleo", label: "Goleadores", meta: topScorer?.goals ? `${topScorer.player.name} | ${topScorer.goals}` : "Sin goles aun" },
    { href: "#mas", label: "Sanciones", meta: "Disciplina" },
    { href: "#equipos", label: "Equipos", meta: `${league.teams.length} registrados` },
    { href: "#jugador", label: "Jugadores", meta: `${league.players.length} registrados` }
  ];

  return (
    <section className="public-home-dashboard" aria-label="Inicio de liga">
      <div className="home-summary-grid">
        <HomeMetric value={league.teams.length} label="Equipos" />
        <HomeMetric value={league.players.length} label="Jugadores" />
        <HomeMetric value={programmedCount} label="Programados" />
        <HomeMetric value={currentRound || "-"} label="Jornada actual" />
      </div>

      <div className="home-feature-grid">
        <article className="home-match-card">
          <div className="home-card-head">
            <span>Proximos partidos</span>
            <strong>{nextMatches.length ? "Agenda de jornada" : "Calendario pendiente"}</strong>
          </div>
          <div className="home-mini-match-list">
            {nextMatches.slice(0, 2).map((match) => (
              <MiniMatchRow key={match.id} league={league} match={match} />
            ))}
            {!nextMatches.length && (
              <p className="empty empty-polished">Aun no hay partidos registrados para esta jornada.</p>
            )}
          </div>
        </article>

        <article className="home-match-card latest">
          <div className="home-card-head">
            <span>Ultimos resultados</span>
            <strong>{finishedCount ? `${finishedCount} juego(s) capturados` : "Actas por capturar"}</strong>
          </div>
          <div className="home-mini-match-list">
            {latestResults.slice(0, 2).map((match) => (
              <MiniMatchRow key={match.id} league={league} match={match} />
            ))}
            {!latestResults.length && (
              <p className="empty empty-polished">Las estadisticas apareceran cuando se capturen las actas finalizadas.</p>
            )}
          </div>
        </article>
      </div>

      <div className="home-quick-actions" aria-label="Accesos rapidos">
        {quickLinks.map((link) => (
          <a href={link.href} key={link.href}>
            <strong>{link.label}</strong>
            <span>{link.meta}</span>
          </a>
        ))}
      </div>
    </section>
  );
}

function HomeMetric({ value, label }) {
  return (
    <article>
      <strong>{value}</strong>
      <span>{label}</span>
    </article>
  );
}

function MiniMatchRow({ league, match }) {
  const home = getTeam(league, match.homeTeamId);
  const away = getTeam(league, match.awayTeamId);
  const isFinished = match.status === "finished" || match.status === "walkover";

  return (
    <a className="mini-match-row" href="#calendario">
      <span className="mini-match-team"><TeamMark team={home} className="mini-match-crest" />{home?.name || "LOCAL"}</span>
      <strong>{isFinished ? `${match.homeGoals ?? 0}-${match.awayGoals ?? 0}` : match.time || "VS"}</strong>
      <span className="mini-match-team away"><TeamMark team={away} className="mini-match-crest" />{away?.name || "VISITANTE"}</span>
      <small>{match.date ? formatDate(match.date) : "Fecha por definir"} | {match.venue || "Cancha por definir"}</small>
    </a>
  );
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

  return (
    <article className="player-public-card">
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
        <span><strong>{displayGoals}</strong> Goles</span>
        <span><strong>{playedMatches}</strong> PJ</span>
        <span><strong>{displayYellowCards}</strong> Amarillas</span>
        <span><strong>{row.redCards || 0}</strong> Rojas</span>
        {"assists" in row && <span><strong>{row.assists || 0}</strong> Asistencias</span>}
        <span><strong>{row.suspensionMatches || 0}</strong> Suspensiones</span>
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
          <strong>{lastGoal ? `${formatDate(lastGoal.match.date)} | J${lastGoal.match.round || "-"}` : "Este jugador aun no tiene goles registrados."}</strong>
        </article>
        {lastMatch && (
          <article>
            <span>Ultimo partido</span>
            <MatchVersus league={league} match={lastMatch} />
            <MatchScore match={lastMatch} />
          </article>
        )}
        {nextMatch && (
          <article>
            <span>Proximo partido</span>
            <MatchVersus league={league} match={nextMatch} />
            <MatchMeta match={nextMatch} />
          </article>
        )}
      </div>

      <div className="player-recent-history">
        <strong>Historial reciente</strong>
        {recentMatches.map((match) => (
          <MiniMatchRow key={match.id} league={league} match={match} />
        ))}
        {!recentMatches.length && <p className="empty empty-polished">Este jugador aun no tiene historial reciente de partidos finalizados.</p>}
      </div>

      {activePlayerTeam && (
        <a
          className="player-team-link"
          href="#equipos"
          onClick={() => onSelectTeam(activePlayerTeam.id)}
        >
          Ver perfil del equipo
        </a>
      )}
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

  return (
    <span aria-hidden="true" className={`team-mark ${className}`} style={style} title={label}>
      {team?.logoUrl ? <img alt="" src={team.logoUrl} /> : getTeamInitials(label)}
    </span>
  );
}

function PlayerAvatar({ player, className = "" }) {
  const canShowPhoto = Boolean(player?.photoAuthorized === true && player?.photoUrl);

  return (
    <span className={`player-avatar ${className}`} title={player?.name || "Jugador"}>
      {canShowPhoto && (
        <img
          alt=""
          loading="lazy"
          src={player.photoUrl}
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      )}
      <span>{getTeamInitials(player?.name || "J")}</span>
    </span>
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
          <label className="tournament-sheet-search">
            <span>Buscar torneo</span>
            <input
              value={categorySearch}
              placeholder="Primera, Fut 7..."
              onChange={(event) => setCategorySearch(event.target.value)}
            />
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

function StandingsTable({ rows, rules, league, competition, onShare }) {
  if (!rows.length) return <p className="empty">Aun no hay equipos registrados.</p>;
  const playoffQualifiers = Math.max(0, Number(rules?.playoffQualifiers ?? 8));
  const qualifiedCount = Math.min(playoffQualifiers, rows.length);
  const playoffLabel = getPlayoffPhaseLabel(playoffQualifiers);
  const competitionLabel = competition?.name || league?.season || "Competencia";
  const seasonLabel = competition?.season || league?.season || "";
  const statLabels = [
    ["PJ", "played"],
    ["G", "wins"],
    ["E", "draws"],
    ["P", "losses"],
    ["GF", "goalsFor"],
    ["GC", "goalsAgainst"],
    ["DG", "goalDifference"]
  ];

  return (
    <section className="standings-showcase" aria-label="Tabla de posiciones">
      <div className="standings-showcase-topbar">
        <div className="standings-showcase-brand">
          <img alt="LIGATEC" src={ligatecLogo} />
          <strong>LIGA<span>TEC</span></strong>
        </div>
        <span>
          <small>Competencia</small>
          <strong>{seasonLabel}</strong>
        </span>
        {onShare && (
          <button type="button" onClick={onShare}>
            <span className="whatsapp-icon">W</span>
            <span>
              <strong>Compartir tabla</strong>
              <small>Imagen WhatsApp</small>
            </span>
          </button>
        )}
      </div>
      <div className="standings-showcase-heading">
        <span className="standings-showcase-icon" aria-hidden="true">
          <span>1</span>
          <span>2</span>
          <span>3</span>
        </span>
        <div>
          <h3>Tabla de <strong>posiciones</strong></h3>
          <p>{competitionLabel}{qualifiedCount > 0 ? ` | Zona de liguilla - Puestos 1 al ${qualifiedCount}${playoffLabel ? ` | ${playoffLabel}` : ""}` : ""}</p>
        </div>
      </div>
      <StandingsInsights rows={rows} />
      <div className="standings-board" role="table">
        <div className="standings-board-header" role="row">
          <span>Pos</span>
          <span>Equipo</span>
          {statLabels.map(([label]) => <span key={label}>{label}</span>)}
          <span>PTS</span>
        </div>
        {rows.map((row, index) => {
          const isQualified = index < qualifiedCount;
          const rank = index + 1;
          return (
            <div className="standings-row-group" key={row.team.id}>
              {qualifiedCount > 0 && index === qualifiedCount && (
                <div className="standings-zone-line">
                  <span>{playoffLabel ? `Zona de liguilla - ${playoffLabel}` : "Zona de liguilla"}</span>
                </div>
              )}
              <article
                className={[`rank-${rank}`, rank <= 3 ? "top-rank" : "", isQualified ? "qualified-playoff" : ""].filter(Boolean).join(" ")}
                role="row"
              >
                <span className="position-cell" role="cell">{rank}</span>
                <span className="standings-team" role="cell">
                  <TeamMark team={row.team} className="standings-crest" />
                  <span className="team-name-cell">{row.team.name}</span>
                </span>
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
                <span className="points-cell" role="cell"><strong>{row.points}</strong></span>
              </article>
            </div>
          );
        })}
      </div>
    </section>
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

function MatchCard({ league, match }) {
  const isFinished = match.status === "finished" || match.status === "walkover";
  const isPostponed = match.status === "postponed";
  const isScheduleChanged = ["postponed", "rescheduled", "advanced"].includes(match.status || "");
  const timeLabel = match.time ? `${match.time} hrs` : "Hora por definir";
  const timeOrScore = isFinished ? `${match.homeGoals ?? 0} - ${match.awayGoals ?? 0}` : isPostponed ? "POSP." : "VS";
  const dateParts = getMatchDateParts(match.date);
  const competition = getCompetition(league, match.competitionId);
  const homeTeam = getTeam(league, match.homeTeamId);
  const awayTeam = getTeam(league, match.awayTeamId);
  const statusLabel = getMatchStatusLabel(match);
  const isPlayoff = (match.stage || "regular") === "playoff";
  const hasAggregate = match.aggregateHome !== null && match.aggregateHome !== undefined && match.aggregateAway !== null && match.aggregateAway !== undefined;
  const tiebreakerRows = getMatchTiebreakerRows(match);
  const matchContext = [match.playoffLeg, hasAggregate ? `Global ${match.aggregateHome}-${match.aggregateAway}` : ""].filter(Boolean);

  return (
    <details className={`match-card ${isFinished ? "is-finished" : "is-scheduled"} ${isScheduleChanged ? "has-schedule-note" : ""} ${match.status ? `status-${match.status}` : ""}`}>
      <summary>
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
        <div className="match-card-action" aria-label={isFinished ? "Toca para ver goles" : "Partido programado"}>
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
              <span className="match-touch-hint"><MatchMetaIcon type="ball" />Ver goles</span>
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
      </summary>
      <div className="match-details">
        <div className="match-expanded-head">
          <span>{league.city} | {competition?.name || "TORNEO"}</span>
          <strong>{isPlayoff ? match.playoffRound || "Liguilla" : `Jornada ${match.round || "-"}`}</strong>
          <small>{match.date ? formatDate(match.date) : "FECHA POR DEFINIR"} | {match.time || "HORA POR DEFINIR"} | {match.venue || "CANCHA POR DEFINIR"}</small>
        </div>

        <div className="match-scoreboard" aria-label="Resumen del partido">
          <div className="match-score-team home">
            <TeamMark team={homeTeam} className="team-dot" />
            <strong>{homeTeam?.name || "LOCAL"}</strong>
          </div>
          <div className="match-score-center">
            <span>{statusLabel}</span>
            <strong>{isFinished ? `${match.homeGoals ?? 0} - ${match.awayGoals ?? 0}` : "VS"}</strong>
            {isPlayoff && matchContext.length > 0 && <small>{matchContext.join(" | ")}</small>}
            {tiebreakerRows.length > 0 && (
              <div className="match-tiebreakers" aria-label="Desempate del partido">
                {tiebreakerRows.map((row) => (
                  <span key={row.label}><b>{row.label}</b>{row.value}</span>
                ))}
              </div>
            )}
          </div>
          <div className="match-score-team away">
            <TeamMark team={awayTeam} className="team-dot" />
            <strong>{awayTeam?.name || "VISITANTE"}</strong>
          </div>
        </div>

        <MatchEventSummary league={league} match={match} homeTeam={homeTeam} awayTeam={awayTeam} />
        {match.observations && <p className="match-observations"><strong>Observaciones</strong>{match.observations}</p>}
        {match.resolutionNote && <p className="match-observations"><strong>Resolucion</strong>{match.resolutionNote}</p>}
      </div>
    </details>
  );
}

function MatchMetaIcon({ type }) {
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
  const showTimeline = events.some((event) => hasEventMinute(event));
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
    <div className={`match-event-detail ${showTimeline ? "with-minutes" : "without-minutes"}`}>
      <div className="match-event-legend">
        <span><b className="legend-card yellow" />Amarilla</span>
        <span><b className="legend-card red" />Roja</span>
        <span><b className="legend-ball">⚽</b>Gol</span>
      </div>
      {showTimeline ? (
        <MatchEventTimeline league={league} match={match} events={events} homeTeam={homeTeam} awayTeam={awayTeam} />
      ) : (
        <div className="match-events-board no-minutes">
          <MatchTeamEvents title={homeTeam?.name || "LOCAL"} events={homeEvents} league={league} showMinutes={false} />
          <div className="match-events-divider" aria-hidden="true">
            <span />
          </div>
          <MatchTeamEvents title={awayTeam?.name || "VISITANTE"} events={awayEvents} league={league} showMinutes={false} />
        </div>
      )}
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
  if (event.cardDetail === "double_yellow") return "Roja por 2a amarilla";
  if (event.cardDetail === "double_yellow_second") return "2a amarilla";
  if (event.type === "goal") return "Gol";
  if (event.type === "own_goal") return "Autogol";
  if (event.type === "yellow") return "Amonestacion";
  if (event.type === "red") return event.reason || "Expulsion";
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
    .filter((sponsor) => sponsor.status === "active" && sponsor.imageUrl)
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

function getPublicMatchTraceLabel(league, match) {
  if (!match) return "";
  const home = getTeam(league, match.homeTeamId)?.name || "Local";
  const away = getTeam(league, match.awayTeamId)?.name || "Visitante";
  const round = match.round ? `J${match.round}` : "Jornada";
  const date = match.date ? formatDate(match.date) : "Fecha por definir";
  return `${round} | ${home} vs ${away} | ${date}`;
}

function isPublicExpulsionNotice(notice) {
  const type = normalizeSearchTerm(notice.type || "");
  return type.includes("expulsion") || type.includes("roja");
}

function getPublicNoticeOriginMatch(league, notice) {
  if (notice.originMatch) return notice.originMatch;

  const matches = league.matches || [];
  const originMatchId = notice.origin?.matchId || "";
  if (originMatchId) {
    const matchById = matches.find((match) => match.id === originMatchId);
    if (matchById) return matchById;
  }

  if (!notice.player?.id) return null;

  return matches.find((match) => (
    (!notice.origin?.date || match.date === notice.origin.date) &&
    (!notice.origin?.round || Number(match.round || 0) === Number(notice.origin.round || 0)) &&
    (match.events || []).some((event) => event.type === "red" && event.playerId === notice.player.id)
  )) || null;
}

function DisciplineTrace({ league, title, matches = [], fallback = "" }) {
  const cleanMatches = matches.filter(Boolean).slice(0, 4);
  if (!cleanMatches.length && !fallback) return null;
  return (
    <div className="public-discipline-trace">
      <span>{title}</span>
      {cleanMatches.map((match) => (
        <small key={match.id}>{getPublicMatchTraceLabel(league, match)}</small>
      ))}
      {!cleanMatches.length && fallback && <small>{fallback}</small>}
    </div>
  );
}

function SuspensionNotices({ league, notices }) {
  if (!notices.length) return <p className="empty">No hay jugadores suspendidos para la siguiente jornada.</p>;

  return (
    <div className="suspension-notice-list">
      {notices.map((notice) => {
        const isExpulsion = isPublicExpulsionNotice(notice);
        const originMatch = getPublicNoticeOriginMatch(league, notice);
        const returnLabel = notice.returnMatch ? getPublicMatchTraceLabel(league, notice.returnMatch) : "";
        return (
          <article className={`suspension-notice ${notice.status}`} key={notice.id}>
            <strong>{notice.player.name}</strong>
            <span>{notice.team?.name || "Sin equipo"}</span>
            {notice.pendingReview ? (
              <p>Expulsado y sujeto a revision por comision disciplinaria. No puede ser alineado hasta resolucion.</p>
            ) : notice.indefinite ? (
              <p>{isExpulsion ? "Expulsado" : "Suspendido"} con inhabilitacion indefinida hasta resolucion de la liga.</p>
            ) : (
              <p>
                {isExpulsion ? "Expulsado" : "Suspendido"} por {notice.totalMatches} partido(s). Le restan {notice.remainingMatches} juego(s) de suspension.
                {notice.returnRound ? ` Podra regresar en la jornada ${notice.returnRound}.` : ""}
              </p>
            )}
            <small>{notice.reason}</small>
            <DisciplineTrace
              league={league}
              title={isExpulsion ? "Expulsado en" : "Origen"}
              matches={originMatch ? [originMatch] : []}
              fallback={notice.origin?.date ? `${notice.origin.round ? `J${notice.origin.round} | ` : ""}${formatDate(notice.origin.date)}` : ""}
            />
            <DisciplineTrace league={league} title="Cumplidos" matches={notice.servedMatchList || []} />
            {returnLabel && (
              <div className="public-discipline-trace return">
                <span>Regreso</span>
                <small>{returnLabel}</small>
              </div>
            )}
          </article>
        );
      })}
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

function Discipline({ league, rows }) {
  if (!rows.length) return <p className="empty">Sin amarillas vigentes registradas.</p>;

  return (
    <div className="discipline-list">
      {rows.map((row) => {
        const sourceMatches = (row.sources || [])
          .map((source) => source.matchId ? league.matches.find((match) => match.id === source.matchId) : null)
          .filter(Boolean);
        return (
          <article className={row.status} key={row.player.id}>
            <div className="discipline-player">
              <strong>{row.player.name}</strong>
              <span>Equipo: {row.team?.name || "Sin equipo"}</span>
            </div>
            <div className="yellow-card-progress" aria-label={`${row.yellowCards} de ${row.yellowLimit} amarillas`}>
              <strong>{row.yellowCards}/{row.yellowLimit}</strong>
            </div>
            <small>{row.message}</small>
            <DisciplineTrace league={league} title="Amarillas en" matches={sourceMatches} />
          </article>
        );
      })}
    </div>
  );
}

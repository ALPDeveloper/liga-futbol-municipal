import { useEffect, useMemo, useState } from "react";
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
  getIdentityTags,
  getPlayer,
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
  try {
    const competitionId = localStorage.getItem(getPublicCompetitionStorageKey(league.id)) || "";
    return league.competitions?.some((competition) => competition.id === competitionId) ? competitionId : "";
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

export function PublicView({ heroImage, legalPath = "/legal", league, onNavigate }) {
  const [showIntro, setShowIntro] = useState(true);
  const [publicSearch, setPublicSearch] = useState("");
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [selectedCompetitionId, setSelectedCompetitionId] = useState(() => loadLastCompetitionId(league) || getDefaultCompetitionId(league));
  const activeLeague = useMemo(
    () => scopeLeagueToCompetition(league, selectedCompetitionId),
    [league, selectedCompetitionId]
  );
  const regularLeague = useMemo(() => ({ ...activeLeague, matches: regularMatches(activeLeague) }), [activeLeague]);
  const playoffs = useMemo(() => playoffMatches(activeLeague), [activeLeague]);
  const activeCompetition = getCompetition(league, selectedCompetitionId);
  const [selectedSeason, setSelectedSeason] = useState(activeCompetition?.season || league.season);
  const standings = calculateStandings(regularLeague);
  const stats = calculatePlayerStats(activeLeague);
  const scheduledMatches = sortPublicMatches(regularLeague.matches.filter((match) => match.status === "scheduled"));
  const nextMatches = scheduledMatches.slice(0, 4);
  const latestResults = sortRecentMatches(finishedMatches(regularLeague)).slice(0, 3);
  const featuredMatch = getFeaturedPublicMatch(regularLeague, standings);
  const rounds = useMemo(() => (
    [...new Set(regularLeague.matches.map((match) => Number(match.round || 0)).filter(Boolean))]
      .sort((a, b) => a - b)
  ), [regularLeague.matches]);
  const defaultRound = useMemo(() => (
    (activeCompetition?.activeRound && rounds.includes(Number(activeCompetition.activeRound))
      ? activeCompetition.activeRound
      : getCurrentDisplayRound(regularLeague.matches)) || rounds.at(-1) || ""
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
  const scorers = stats.filter((row) => row.goals > 0).sort((a, b) => b.goals - a.goals).slice(0, 5);
  const discipline = calculateYellowCardDiscipline(activeLeague);
  const spotlights = useMemo(
    () => buildPublicSpotlights(activeLeague).filter((item) => item.label !== "Partido destacado"),
    [activeLeague]
  );
  const fairPlayTeams = useMemo(() => buildFairPlayTeams(activeLeague).slice(0, 4), [activeLeague]);
  const [selectedTeamId, setSelectedTeamId] = useState(activeLeague.teams[0]?.id || "");
  const selectedTeam = activeLeague.teams.find((team) => team.id === selectedTeamId) || activeLeague.teams[0] || null;
  const suspensionNotices = calculateSuspensionNotices(activeLeague).filter((notice) => notice.status === "active");
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
    () => getPublicSearchResults(activeLeague, stats, publicSearch),
    [activeLeague, publicSearch, stats]
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

  useEffect(() => {
    const timer = window.setTimeout(() => setShowIntro(false), 520);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const defaultCompetitionId = getDefaultCompetitionId(league);
    const rememberedCompetitionId = loadLastCompetitionId(league);
    const hasSelectedCompetition = league.competitions?.some((competition) => competition.id === selectedCompetitionId);
    const nextCompetitionId = hasSelectedCompetition ? selectedCompetitionId : rememberedCompetitionId || defaultCompetitionId;
    if (nextCompetitionId && selectedCompetitionId !== nextCompetitionId) setSelectedCompetitionId(nextCompetitionId);
  }, [league, selectedCompetitionId]);

  useEffect(() => {
    if (league.competitions?.some((competition) => competition.id === selectedCompetitionId)) {
      saveLastCompetitionId(league.id, selectedCompetitionId);
    }
  }, [league.id, league.competitions, selectedCompetitionId]);

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

  return (
    <main className="page">
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
        onSelectPlayer={selectPublicPlayer}
        onSelectTeam={setSelectedTeamId}
        onShare={shareLeague}
        query={publicSearch}
        results={publicSearchResults}
      />

      <PublicHomeDashboard
        league={activeLeague}
        latestResults={latestResults}
        nextMatches={nextMatches}
        standings={standings}
        currentRound={defaultRound}
        stats={stats}
      />

      <PublicPulseBar
        league={regularLeague}
        roundMatches={selectedRoundMatches}
        standings={standings}
      />

      <section className="panel competition-panel" aria-label="Temporadas y torneos">
        <SectionHeading eyebrow="Temporada" title={activeCompetition?.name || "Torneo actual"} />
        <CompetitionSelector
          competitions={league.competitions || []}
          selectedSeason={selectedSeason}
          selectedCompetitionId={selectedCompetitionId}
          onSelectSeason={setSelectedSeason}
          onSelectCompetition={setSelectedCompetitionId}
        />
        {activeCompetition && (
          <div className="competition-summary">
            <span>{competitionTypeLabel(activeCompetition.type)}</span>
            <strong>{activeCompetition.season}</strong>
          </div>
        )}
      </section>

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
          <section className="panel" id="tabla">
            <SectionHeading eyebrow="Competencia" title="Tabla de posiciones" />
            <ShareActionButton
              label="Compartir tabla"
              onClick={() => shareStandingsCard({ league, competition: activeCompetition, standings, url: window.location.href })}
            />
            <StandingsTable rows={standings} rules={activeLeague.rules} />
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
                onClick={() => shareRoundCard({ league: activeLeague, selectedRound, matches: selectedRoundMatches, url: window.location.href })}
              />
            )}
            <div className="match-list">
              {selectedRoundMatches.map((match) => <MatchCard key={match.id} league={activeLeague} match={match} />)}
              <RestingTeams teams={restingTeams} />
              {!selectedRoundMatches.length && <p className="empty">Aun no hay partidos programados en esta jornada.</p>}
            </div>
          </section>

          <section className="panel" id="liguilla">
            <SectionHeading eyebrow="Fase final" title="Liguilla" />
            <PlayoffList league={activeLeague} matches={playoffs} />
          </section>

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
            <Scorers rows={scorers} onSelectPlayer={selectPublicPlayer} />
          </section>

          <section className="panel">
            <SectionHeading eyebrow="Siguiente jornada" title="Expulsados y regresos" />
            <SuspensionNotices notices={suspensionNotices} />
          </section>

          <section className="panel">
            <SectionHeading eyebrow="Apoyo" title="Lesionados" />
            <InjurySupportList league={activeLeague} injuries={activeInjuries} />
          </section>

          <section className="panel">
            <SectionHeading eyebrow="Control" title="Disciplina" />
            <Discipline rows={discipline} />
          </section>

          <section className="panel">
            <SectionHeading eyebrow="Reconocimiento" title="Juego limpio" />
            <FairPlayTeams rows={fairPlayTeams} />
          </section>
        </aside>
      </section>

      <PublicLegalFooter legalPath={legalPath} league={league} onNavigate={onNavigate} />
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
    match.status === "scheduled" &&
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

function getPublicSearchResults(league, stats, query) {
  const term = normalizeSearchTerm(query);
  if (term.length < 2) return [];
  const goalsByPlayer = new Map((stats || []).map((row) => [row.player.id, row.goals || 0]));
  const teamResults = league.teams
    .filter((team) => normalizeSearchTerm(team.name).includes(term))
    .map((team) => ({
      id: team.id,
      type: "team",
      href: "#equipos",
      name: team.name,
      detail: `${league.players.filter((player) => player.teamId === team.id).length} jugador(es)`
    }));
  const playerResults = league.players
    .filter((player) => normalizeSearchTerm(player.name).includes(term))
    .map((player) => {
      const team = getTeam(league, player.teamId);
      return {
        id: player.id,
        type: "player",
        href: "#jugador",
        name: player.name,
        detail: `${team?.name || "Sin equipo"} | ${goalsByPlayer.get(player.id) || 0} gol(es)`
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
      detail: `${match.round ? `Jornada ${match.round}` : "Partido"} | ${match.date ? formatDate(match.date) : "Fecha por definir"}`
    }));

  return [...teamResults, ...playerResults, ...matchResults]
    .sort((a, b) => a.name.localeCompare(b.name))
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

async function shareStandingsCard({ league, competition, standings, url }) {
  const title = `Tabla de posiciones | ${league.name}`;
  const text = buildStandingsShareText(league, competition, standings);
  await shareGeneratedCard({
    fallback: { text, url },
    fileName: "tabla-posiciones.png",
    imageBuilder: () => createStandingsShareImage({ league, competition, standings }),
    text,
    title
  });
}

async function shareRoundCard({ league, selectedRound, matches, url }) {
  const title = `Jornada ${selectedRound || ""} | ${league.name}`;
  const text = buildRoundShareText(league, selectedRound, matches);
  await shareGeneratedCard({
    fallback: { text, url },
    fileName: `jornada-${selectedRound || "partidos"}.png`,
    imageBuilder: () => createRoundShareImage({ league, selectedRound, matches }),
    text,
    title
  });
}

async function shareGeneratedCard({ fallback, fileName, imageBuilder, text, title }) {
  let blob = null;

  try {
    const canvas = await imageBuilder();
    blob = await canvasToPngBlob(canvas);
  } catch (error) {
    shareWhatsAppItem(fallback);
    return;
  }

  const file = new File([blob], fileName, { type: "image/png" });
  const shareData = { files: [file], text, title };

  if (canShareGeneratedFile(shareData)) {
    try {
      await navigator.share(shareData);
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
  }

  if (await copyImageBlobToClipboard(blob)) {
    window.alert("Imagen copiada. Abre WhatsApp y pegala en el chat para enviarla como imagen.");
    return;
  }

  downloadBlob(blob, fileName);
  window.alert("Tu navegador no permite adjuntar la imagen directamente. Se descargo el PNG para que puedas enviarlo por WhatsApp como imagen.");
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

function createStandingsShareImage({ league, competition, standings }) {
  const rows = standings.slice(0, 12);
  const width = 1080;
  const height = 238 + rows.length * 68 + 78;
  const { canvas, context } = createShareCanvas(width, height);

  drawShareBackground(context, width, height, league);
  drawShareHeader(context, {
    eyebrow: competition?.name || league.season,
    league,
    title: "TABLA DE POSICIONES"
  });

  drawRoundedRect(context, 60, 172, width - 120, 42, 12, "#e9f7ef");
  drawShareLabel(context, "POS", 82, 184, "#0f2f24");
  drawShareLabel(context, "EQUIPO", 180, 184, "#0f2f24");
  drawShareLabel(context, "PTS", 725, 184, "#0f2f24");
  drawShareLabel(context, "PJ", 820, 184, "#0f2f24");
  drawShareLabel(context, "DG", 910, 184, "#0f2f24");

  rows.forEach((row, index) => {
    const y = 232 + index * 68;
    const rank = index + 1;
    const accent = rank === 1 ? "#e7c948" : rank === 2 ? "#34699a" : rank === 3 ? "#b6e35c" : "#0f6b4f";
    drawRoundedRect(context, 60, y, width - 120, 56, 14, rank <= 3 ? "#09261f" : "#ffffff");
    context.fillStyle = accent;
    drawRoundedRect(context, 60, y, 62, 56, 14, accent);
    context.fillStyle = rank === 1 || rank === 3 ? "#102016" : "#ffffff";
    context.font = "900 28px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    context.fillText(String(rank), 82, y + 12);

    drawTeamBubble(context, row.team, 150, y + 11, 34);
    context.fillStyle = rank <= 3 ? "#ffffff" : "#11231d";
    context.font = "900 26px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    drawCanvasText(context, row.team.name, 198, y + 13, 470, 29, 1);

    context.fillStyle = rank <= 3 ? "#dff7e9" : "#0f6b4f";
    context.font = "950 30px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    context.fillText(String(row.points), 732, y + 12);
    context.fillStyle = rank <= 3 ? "#d7e5de" : "#64736b";
    context.font = "900 24px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    context.fillText(String(row.played), 826, y + 15);
    context.fillText(String(row.goalDifference), 916, y + 15);
  });

  drawShareFooter(context, width, height, league);
  return Promise.resolve(canvas);
}

function createRoundShareImage({ league, selectedRound, matches }) {
  const rows = sortPublicMatches(matches);
  const width = 1080;
  const height = 238 + rows.length * 92 + 78;
  const { canvas, context } = createShareCanvas(width, height);

  drawShareBackground(context, width, height, league);
  drawShareHeader(context, {
    eyebrow: league.season,
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
  return Promise.resolve(canvas);
}

function drawShareBackground(context, width, height) {
  context.fillStyle = "#f6faf7";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#0f6b4f";
  context.fillRect(0, 0, width, 136);
  context.fillStyle = "rgba(182, 227, 92, 0.28)";
  context.beginPath();
  context.arc(width - 80, 40, 180, 0, Math.PI * 2);
  context.fill();
}

function drawShareHeader(context, { eyebrow, league, title }) {
  drawRoundedRect(context, 60, 34, 62, 62, 16, "#ffffff");
  context.fillStyle = "#0f6b4f";
  context.font = "950 24px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  context.fillText(getTeamInitials(league.name), 76, 52);
  context.fillStyle = "#dff7e9";
  context.font = "900 22px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  context.fillText(String(eyebrow || "").toLocaleUpperCase("es-MX"), 142, 36);
  context.fillStyle = "#ffffff";
  context.font = "950 42px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  drawCanvasText(context, title, 142, 64, 820, 45, 1);
}

function drawShareFooter(context, width, height, league) {
  context.fillStyle = "#718078";
  context.font = "850 21px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  const footer = `${league.name} | ${league.city || ""}`.toLocaleUpperCase("es-MX");
  context.fillText(footer, 60, height - 46);
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

function drawRoundedRect(context, x, y, width, height, radius, color) {
  context.fillStyle = color;
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.fill();
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

function buildStandingsShareText(league, competition, standings) {
  const title = `Tabla de posiciones - ${league.name}${competition?.name ? ` (${competition.name})` : ""}`;
  const rows = standings.slice(0, 12).map((row, index) => (
    `${index + 1}. ${row.team.name} - ${row.points} pts | PJ ${row.played} | DG ${row.goalDifference}`
  ));
  return [title, ...rows].join("\n");
}

function buildRoundShareText(league, selectedRound, matches) {
  const title = `${league.name} - Jornada ${selectedRound || "-"}`;
  const rows = matches.map((match) => {
    const home = getTeam(league, match.homeTeamId)?.name || "Local";
    const away = getTeam(league, match.awayTeamId)?.name || "Visitante";
    const date = match.date ? formatDate(match.date) : "Fecha por definir";
    const time = match.time || "Hora por definir";
    const venue = match.venue || "Cancha por definir";
    const result = match.status === "finished" || match.status === "walkover"
      ? `${match.homeGoals ?? 0}-${match.awayGoals ?? 0}`
      : "vs";
    return `${home} ${result} ${away} | ${date} | ${time} | ${venue}`;
  });
  return [title, ...rows].join("\n");
}

function getFeaturedPublicMatch(league, standings) {
  const scheduled = sortPublicMatchesByRound(league.matches.filter((match) => match.status === "scheduled"));
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
        onClick={() => sharePublicItem({
          title: `${home?.name || "Local"} vs ${away?.name || "Visitante"}`,
          text: `${league.name}: ${home?.name || "Local"} vs ${away?.name || "Visitante"} | ${match.date ? formatDate(match.date) : "Fecha por definir"} ${match.time || ""}`,
          url: window.location.href
        })}
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
  const links = [
    { href: "#inicio", label: "Inicio", icon: "I" },
    { href: "#calendario", label: "Partidos", icon: "P" },
    { href: "#tabla", label: "Tabla", icon: "T" },
    { href: "#goleo", label: "Goleo", icon: "G" },
    { href: "#mas", label: "Mas", icon: "M" }
  ];

  return (
    <nav className="public-quick-nav" aria-label="Navegacion publica">
      {links.map((link) => (
        <a href={link.href} key={link.href}>
          <span className="quick-nav-icon" aria-hidden="true">{link.icon}</span>
          <span>{link.label}</span>
        </a>
      ))}
    </nav>
  );
}

function PublicUtilityBar({ leagueName, onSearch, onSelectPlayer, onSelectTeam, onShare, query, results }) {
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
              onClick={() => {
                if (result.type === "team") onSelectTeam(result.id);
                if (result.type === "player") onSelectPlayer(result.id);
                onSearch("");
              }}
            >
              <strong>{result.name}</strong>
              <span>{result.detail}</span>
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
  const programmedCount = league.matches.filter((match) => match.status === "scheduled").length;
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
  const scheduledMatches = sortPublicMatches(league.matches.filter((match) => match.status === "scheduled"));
  const nextMatch = scheduledMatches[0] || null;
  const todayValue = getLocalDateValue(new Date());
  const todayMatches = scheduledMatches.filter((match) => match.date === todayValue);
  const roundPending = roundMatches.filter((match) => match.status === "scheduled").length;
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

  const players = activeLeague.players
    .filter((player) => player.teamId === selectedTeam.id)
    .sort((a, b) => Number(a.number || 999) - Number(b.number || 999) || a.name.localeCompare(b.name));
  const teamMatches = activeLeague.matches
    .filter((match) => match.homeTeamId === selectedTeam.id || match.awayTeamId === selectedTeam.id)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || Number(b.round || 0) - Number(a.round || 0));
  const nextMatch = [...teamMatches].reverse().find((match) => match.status === "scheduled");
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
                  <span className="jersey-number" aria-label={`Jersey ${player.number || "sin numero"}`}>
                    <span>{player.number || "-"}</span>
                  </span>
                  <div>
                    <strong>{player.name}</strong>
                    <span>{normalizePositionLabel(player.position)}</span>
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

function PlayerPublicCard({ league, player, stats, onSelectTeam }) {
  if (!player) return <p className="empty empty-polished">Selecciona un jugador desde el buscador, goleadores o perfil de equipo para abrir su ficha deportiva.</p>;

  const row = stats.find((item) => item.player.id === player.id) || { goals: 0, yellowCards: 0, redCards: 0 };
  const team = getTeam(league, player.teamId);
  const teamPlayers = league.players.filter((item) => item.teamId === player.teamId);
  const teamRanking = getPlayerTeamGoalRank(stats, player, teamPlayers);
  const teamMatches = league.matches
    .filter((match) => match.homeTeamId === player.teamId || match.awayTeamId === player.teamId)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.time).localeCompare(String(a.time)));
  const nextMatch = [...teamMatches].reverse().find((match) => match.status === "scheduled");
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
          <span className="player-public-number">{player.number || "-"}</span>
        </div>
        <div className="player-public-identity">
          <span>{normalizePositionLabel(player.position)}</span>
          <strong>{player.name}</strong>
          <small><TeamMark team={team} className="player-team-crest" />{team?.name || "Sin equipo"}</small>
          <div className="player-badge-row">
            {playerBadges.map((badge) => <span className={badge.tone} key={badge.label}>{badge.label}</span>)}
          </div>
        </div>
      </div>

      <div className="player-public-stats">
        <span><strong>{row.goals || 0}</strong> Goles</span>
        <span><strong>{playedMatches}</strong> PJ</span>
        <span><strong>{row.yellowCards || 0}</strong> Amarillas</span>
        <span><strong>{row.redCards || 0}</strong> Rojas</span>
        {"assists" in row && <span><strong>{row.assists || 0}</strong> Asistencias</span>}
        <span><strong>{row.suspensionMatches || 0}</strong> Suspensiones</span>
      </div>

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

      {team && (
        <a
          className="player-team-link"
          href="#equipos"
          onClick={() => onSelectTeam(team.id)}
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
    <span className={`team-mark ${className}`} style={style} title={label}>
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

function CompetitionSelector({ competitions, selectedSeason, selectedCompetitionId, onSelectSeason, onSelectCompetition }) {
  if (!competitions.length) return <p className="empty">Aun no hay torneos registrados.</p>;
  const seasons = [...new Set(competitions.map((competition) => competition.season).filter(Boolean))]
    .sort((a, b) => String(b).localeCompare(String(a)));
  const visibleCompetitions = competitions.filter((competition) => competition.season === selectedSeason);

  return (
    <div className="competition-picker" aria-label="Seleccionar temporada o torneo">
      <label>Temporada
        <select
          value={selectedSeason}
          onChange={(event) => {
            const season = event.target.value;
            const nextCompetition = competitions.find((competition) => competition.season === season);
            onSelectSeason(season);
            if (nextCompetition) onSelectCompetition(nextCompetition.id);
          }}
        >
          {seasons.map((season) => <option key={season} value={season}>{season}</option>)}
        </select>
      </label>
      <label>Torneo
        <select value={selectedCompetitionId} onChange={(event) => onSelectCompetition(event.target.value)}>
          {visibleCompetitions.map((competition) => (
            <option key={competition.id} value={competition.id}>{competition.name}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

function PlayoffList({ league, matches }) {
  if (!matches.length) return <p className="empty">Aun no hay partidos de liguilla programados en este torneo.</p>;

  return (
    <div className="playoff-list">
      {matches
        .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.time).localeCompare(String(b.time)))
        .map((match) => <PlayoffCard key={match.id} league={league} match={match} />)}
    </div>
  );
}

function PlayoffCard({ league, match }) {
  const home = getTeam(league, match.homeTeamId);
  const away = getTeam(league, match.awayTeamId);
  const result = match.status === "finished" || match.status === "walkover" ? `${match.homeGoals} - ${match.awayGoals}` : match.time || "Por definir";
  const hasAggregate = match.aggregateHome !== null && match.aggregateHome !== undefined && match.aggregateAway !== null && match.aggregateAway !== undefined;

  return (
    <article className="playoff-card">
      <div>
        <span>{match.playoffRound || "Liguilla"}{match.playoffLeg ? ` | ${match.playoffLeg}` : ""}</span>
        <strong>{home?.name || "Local"} vs {away?.name || "Visitante"}</strong>
        <small>{formatDate(match.date)} | {match.venue || "Cancha por definir"}</small>
      </div>
      <div className="playoff-score">
        <strong>{result}</strong>
        {hasAggregate && <span>Global {match.aggregateHome} - {match.aggregateAway}</span>}
      </div>
    </article>
  );
}

function RoundSelector({ rounds, selectedRound, onSelectRound }) {
  if (!rounds.length) return <p className="empty">Aun no hay jornadas programadas.</p>;

  return (
    <div className="round-tabs" aria-label="Seleccionar jornada">
      {rounds.map((round) => (
        <button
          className={Number(selectedRound) === Number(round) ? "active" : ""}
          key={round}
          type="button"
          onClick={() => onSelectRound(round)}
        >
          J{round}
        </button>
      ))}
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

function StandingsTable({ rows, rules }) {
  if (!rows.length) return <p className="empty">Aun no hay equipos registrados.</p>;
  const playoffQualifiers = Math.max(0, Number(rules?.playoffQualifiers ?? 8));
  const qualifiedCount = Math.min(playoffQualifiers, rows.length);
  const playoffLabel = getPlayoffPhaseLabel(playoffQualifiers);

  return (
    <>
      <StandingsInsights rows={rows} />
      {qualifiedCount > 0 && (
        <div className="standings-legend">
          <strong>Zona de liguilla</strong>
          <span>Puestos 1-{qualifiedCount}{playoffLabel ? ` | ${playoffLabel}` : ""}</span>
        </div>
      )}
      <div className="table-wrap standings-table-wrap">
        <table className="standings-table">
          <thead>
            <tr>
              <th>Pos</th>
              <th>Equipo</th>
              <th>PTS</th>
              <th>PJ</th>
              <th>G</th>
              <th>E</th>
              <th>P</th>
              <th>GF</th>
              <th>GC</th>
              <th>DG</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const isQualified = index < qualifiedCount;
              const isCutoff = qualifiedCount > 0 && index === qualifiedCount - 1;
              const rank = index + 1;
              return (
                <tr className={[`rank-${rank}`, rank <= 3 ? "top-rank" : "", isQualified ? "qualified-playoff" : "", isCutoff ? "qualification-cutoff" : ""].filter(Boolean).join(" ")} key={row.team.id}>
                  <td data-label="Pos">
                    <span className="position-cell">{rank}</span>
                    {isQualified && <span className="qualification-mark" title="Zona de liguilla">Q</span>}
                  </td>
                  <td data-label="Equipo">
                    <span className="standings-team">
                      <TeamMark team={row.team} className="standings-crest" />
                      <span className="team-name-cell">{row.team.name}</span>
                    </span>
                  </td>
                  <td className="points-cell" data-label="PTS"><strong>{row.points}</strong></td>
                  <td data-label="PJ">{row.played}</td>
                  <td data-label="G">{row.wins}</td>
                  <td data-label="E">{row.draws}</td>
                  <td data-label="P">{row.losses}</td>
                  <td data-label="GF">{row.goalsFor}</td>
                  <td data-label="GC">{row.goalsAgainst}</td>
                  <td data-label="DG">{row.goalDifference}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function StandingsInsights({ rows }) {
  const leader = rows[0];
  const bestAttack = [...rows].sort((a, b) => b.goalsFor - a.goalsFor || b.points - a.points)[0];
  const bestDefense = [...rows].sort((a, b) => a.goalsAgainst - b.goalsAgainst || b.points - a.points)[0];
  const insights = [
    leader ? { label: "Lider", team: leader.team, value: `${leader.points} pts` } : null,
    bestAttack ? { label: "Mejor ofensiva", team: bestAttack.team, value: `${bestAttack.goalsFor} GF` } : null,
    bestDefense ? { label: "Mejor defensa", team: bestDefense.team, value: `${bestDefense.goalsAgainst} GC` } : null
  ].filter(Boolean);

  return (
    <div className="standings-insights" aria-label="Resumen rapido de tabla">
      {insights.map((item) => (
        <article key={item.label}>
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
    live: "En juego",
    in_progress: "En juego",
    finished: "Finalizado",
    walkover: "Default",
    pending_sheet: "Pendiente de acta"
  };
  if (match.status === "finished" && !(match.events || []).length) return "Pendiente de acta";
  return labels[match.status] || "Programado";
}

function MatchCard({ league, match }) {
  const isFinished = match.status === "finished" || match.status === "walkover";
  const timeLabel = match.time ? `${match.time} hrs` : "Hora por definir";
  const timeOrScore = isFinished ? `${match.homeGoals ?? 0} - ${match.awayGoals ?? 0}` : "VS";
  const competition = getCompetition(league, match.competitionId);
  const homeTeam = getTeam(league, match.homeTeamId);
  const awayTeam = getTeam(league, match.awayTeamId);
  const statusLabel = getMatchStatusLabel(match);
  const isPlayoff = (match.stage || "regular") === "playoff";
  const hasAggregate = match.aggregateHome !== null && match.aggregateHome !== undefined && match.aggregateAway !== null && match.aggregateAway !== undefined;

  return (
    <details className="match-card">
      <summary>
        <div className="match-card-kicker">
          <span>{isPlayoff ? match.playoffRound || "Liguilla" : `Jornada ${match.round || "-"}`}</span>
          <span>{match.date ? formatDate(match.date) : "Fecha por definir"}</span>
        </div>
        <div className="match-card-scoreline">
          <div className="match-card-team home">
            <TeamMark team={homeTeam} className="match-card-crest" />
            <strong>{homeTeam?.name || "LOCAL"}</strong>
          </div>
          <div className="match-card-center">
            <strong>{timeOrScore}</strong>
            {!isFinished && <small>{timeLabel}</small>}
          </div>
          <div className="match-card-team away">
            <TeamMark team={awayTeam} className="match-card-crest" />
            <strong>{awayTeam?.name || "VISITANTE"}</strong>
          </div>
        </div>
        <div className="match-card-footer">
          <span>{match.venue || "Cancha por definir"}</span>
          <span className="match-card-time">{timeLabel}</span>
          <span className={`status ${match.status}`}>{statusLabel}</span>
          <span className="match-detail-button">Ver detalle</span>
        </div>
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
            {isPlayoff && (
              <small>
                {[match.playoffLeg, hasAggregate ? `Global ${match.aggregateHome}-${match.aggregateAway}` : ""].filter(Boolean).join(" | ")}
              </small>
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
    <div className="match-events-board">
      <MatchTeamEvents title={homeTeam?.name || "LOCAL"} events={homeEvents} league={league} />
      <div className="match-events-divider" aria-hidden="true">
        <span />
      </div>
      <MatchTeamEvents title={awayTeam?.name || "VISITANTE"} events={awayEvents} league={league} />
    </div>
  );
}

function hasEventMinute(event) {
  return event.minute !== "" && event.minute !== null && event.minute !== undefined && !Number.isNaN(Number(event.minute));
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
        return Number(left.event.minute) - Number(right.event.minute) || left.index - right.index;
      }
      if (leftHasMinute) return -1;
      if (rightHasMinute) return 1;
      return left.index - right.index;
    })
    .map(({ event }) => event);
}

function MatchTeamEvents({ title, events, league }) {
  return (
    <div className="match-team-events">
      <strong>{title}</strong>
      {events.map((event, index) => {
        const player = getPlayer(league, event.playerId);
        return (
          <article className={`match-event-row ${event.type}`} key={`${event.type}-${event.playerId}-${event.minute}-${index}`}>
            <span className="match-event-minute">{event.minute ? `${event.minute}'` : "--"}</span>
            <span className="match-event-badge">{event.type === "goal" ? "GOL" : event.type === "own_goal" ? "AG" : event.type === "yellow" ? "AM" : "ROJA"}</span>
            <div>
              <strong>{player?.name || "Jugador"}</strong>
              {event.type === "red" && event.reason && <small>{event.reason}</small>}
              {event.type === "yellow" && <small>Amonestacion</small>}
              {event.type === "own_goal" && <small>Autogol</small>}
            </div>
          </article>
        );
      })}
      {!events.length && <p>Sin eventos registrados para este equipo.</p>}
    </div>
  );
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

function SuspensionNotices({ notices }) {
  if (!notices.length) return <p className="empty">No hay jugadores suspendidos para la siguiente jornada.</p>;

  return (
    <div className="suspension-notice-list">
      {notices.map((notice) => (
        <article className={`suspension-notice ${notice.status}`} key={notice.id}>
          <strong>{notice.player.name}</strong>
          <span>{notice.team?.name || "Sin equipo"}</span>
          <p>
            {notice.type === "Expulsion" ? "Expulsado" : "Suspendido"} por {notice.totalMatches} partido(s). Le restan {notice.remainingMatches} juego(s) de suspension.
            {notice.returnRound ? ` Podra regresar en la jornada ${notice.returnRound}.` : ""}
          </p>
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

import { useEffect, useMemo, useState } from "react";
import {
  calculatePlayerStats,
  calculateStandings,
  calculateSuspensionNotices,
  buildSmartHighlights,
  finishedMatches,
  formatDate,
  getCompetition,
  getCurrentDisplayRound,
  getDefaultCompetitionId,
  getIdentityTags,
  getTeam,
  playoffMatches,
  regularMatches,
  scopeLeagueToCompetition
} from "../lib/domain.js";

export function PublicView({ heroImage, league }) {
  const [selectedCompetitionId, setSelectedCompetitionId] = useState(getDefaultCompetitionId(league));
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
  const nextMatches = regularLeague.matches.filter((match) => match.status === "scheduled").slice(0, 4);
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

    return league.teams
      .filter((team) => competitionTeamIds.has(team.id) && !playingTeamIds.has(team.id) && team.status !== "withdrawn")
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [league.teams, regularLeague.matches, selectedRoundMatches]);
  const scorers = stats.filter((row) => row.goals > 0).sort((a, b) => b.goals - a.goals).slice(0, 5);
  const discipline = stats
    .filter((row) => row.yellowCards || row.redCards || row.suspensionMatches)
    .sort((a, b) => b.suspensionMatches - a.suspensionMatches || b.yellowCards - a.yellowCards);
  const spotlights = useMemo(() => buildPublicSpotlights(activeLeague), [activeLeague]);
  const streaks = useMemo(() => buildTeamStreaks(regularLeague).slice(0, 4), [regularLeague]);
  const fairPlayTeams = useMemo(() => buildFairPlayTeams(activeLeague).slice(0, 4), [activeLeague]);
  const [selectedTeamId, setSelectedTeamId] = useState(league.teams[0]?.id || "");
  const selectedTeam = league.teams.find((team) => team.id === selectedTeamId) || league.teams[0] || null;
  const suspensionNotices = calculateSuspensionNotices(activeLeague);
  const activeInjuries = useMemo(() => (
    (activeLeague.injuries || [])
      .filter((injury) => injury.status === "active")
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
  ), [activeLeague]);
  const highlights = useMemo(() => (
    [...buildSmartHighlights(activeLeague), ...(league.highlights || [])]
      .filter((item, index, items) => item && items.indexOf(item) === index)
      .slice(0, 6)
  ), [activeLeague, league.highlights]);
  const identityTags = getIdentityTags(league);

  useEffect(() => {
    const defaultCompetitionId = getDefaultCompetitionId(league);
    if (!league.competitions?.some((competition) => competition.id === selectedCompetitionId)) {
      setSelectedCompetitionId(defaultCompetitionId);
    }
  }, [league, selectedCompetitionId]);

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
    if (!league.teams.length) {
      setSelectedTeamId("");
      return;
    }
    if (!league.teams.some((team) => team.id === selectedTeamId)) setSelectedTeamId(league.teams[0].id);
  }, [league.teams, selectedTeamId]);

  return (
    <main className="page">
      <section className="hero" style={{ "--hero-image": `url(${heroImage})` }}>
        <div className="hero-content">
          <span className="eyebrow">
            {league.city} | {league.season}
          </span>
          <h1>{league.name}</h1>
          <p>{league.identity.publicIntro}</p>
          <div className="hero-actions">
            <a href="#calendario" className="primary">Ver calendario</a>
            <a href="#tabla" className="secondary">Tabla general</a>
          </div>
        </div>
      </section>

      {league.status === "suspended" && (
        <section className="suspension-banner">
          <strong>Liga suspendida temporalmente</strong>
          <span>La informacion puede mostrarse limitada hasta que la membresia sea reactivada.</span>
        </section>
      )}

      {identityTags.length > 0 && (
        <section className="identity-strip" aria-label="Identidad de liga">
          {identityTags.map((tag) => <span key={tag}>{tag}</span>)}
        </section>
      )}

      <section className="stats-grid" aria-label="Resumen de liga">
        <SummaryStat value={league.teams.length} label="Equipos" />
        <SummaryStat value={finishedMatches(regularLeague).length} label="Juegos capturados" />
        <SummaryStat value={league.players.length} label="Jugadores" />
        <SummaryStat value={nextMatches.length} label="Proximos partidos" />
      </section>

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

      <section className="content-grid">
        <div className="main-column">
          <section className="panel" id="tabla">
            <SectionHeading eyebrow="Competencia" title="Tabla de posiciones" />
            <StandingsTable rows={standings} />
          </section>

          <section className="panel" id="calendario">
            <SectionHeading eyebrow="Jornada" title="Partidos" />
            <RoundSelector rounds={rounds} selectedRound={selectedRound} onSelectRound={setSelectedRound} />
            <div className="round-summary">
              <strong>Jornada {selectedRound || "-"}</strong>
              <span>{selectedRoundMatches.length} partido(s)</span>
            </div>
            <div className="match-list">
              {selectedRoundMatches.map((match) => <MatchCard key={match.id} league={league} match={match} />)}
              <RestingTeams teams={restingTeams} />
              {!selectedRoundMatches.length && <p className="empty">Aun no hay partidos programados en esta jornada.</p>}
            </div>
          </section>

          <section className="panel" id="liguilla">
            <SectionHeading eyebrow="Fase final" title="Liguilla" />
            <PlayoffList league={league} matches={playoffs} />
          </section>

          <section className="panel" id="equipos">
            <SectionHeading eyebrow="Clubes" title="Perfil de equipo" />
            <TeamProfile
              league={league}
              selectedTeam={selectedTeam}
              selectedTeamId={selectedTeamId}
              onSelectTeam={setSelectedTeamId}
            />
          </section>
        </div>

        <aside className="side-column">
          <section className="panel">
            <SectionHeading eyebrow="Portada" title="Destacados" />
            <ul className="highlight-list">
              {highlights.map((item) => <li key={item}>{item}</li>)}
            </ul>
            {!highlights.length && <p className="empty">Aun no hay destacados para este torneo.</p>}
          </section>

          <section className="ad-slot">
            <span>Patrocinador</span>
            <strong>{league.adBanner}</strong>
          </section>

          <section className="panel">
            <SectionHeading eyebrow="Individual" title="Goleadores" />
            <Scorers rows={scorers} />
          </section>

          <section className="panel">
            <SectionHeading eyebrow="Siguiente jornada" title="Expulsados y regresos" />
            <SuspensionNotices notices={suspensionNotices} />
          </section>

          <section className="panel">
            <SectionHeading eyebrow="Apoyo" title="Lesionados" />
            <InjurySupportList league={league} injuries={activeInjuries} />
          </section>

          <section className="panel">
            <SectionHeading eyebrow="Control" title="Disciplina" />
            <Discipline rows={discipline} />
          </section>

          <section className="panel">
            <SectionHeading eyebrow="Momento" title="Rachas" />
            <TeamStreaks rows={streaks} />
          </section>

          <section className="panel">
            <SectionHeading eyebrow="Reconocimiento" title="Juego limpio" />
            <FairPlayTeams rows={fairPlayTeams} />
          </section>
        </aside>
      </section>
    </main>
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

function buildTeamStreaks(league) {
  return league.teams.map((team) => {
    const recent = finishedMatches(league)
      .filter((match) => match.homeTeamId === team.id || match.awayTeamId === team.id)
      .sort((a, b) => (
        Number(b.round || 0) - Number(a.round || 0) ||
        String(b.date).localeCompare(String(a.date))
      ));

    let wins = 0;
    let unbeaten = 0;
    for (const match of recent) {
      const isHome = match.homeTeamId === team.id;
      const goalsFor = isHome ? Number(match.homeGoals || 0) : Number(match.awayGoals || 0);
      const goalsAgainst = isHome ? Number(match.awayGoals || 0) : Number(match.homeGoals || 0);
      if (goalsFor > goalsAgainst) {
        wins += 1;
        unbeaten += 1;
        continue;
      }
      if (goalsFor === goalsAgainst) {
        unbeaten += 1;
        break;
      }
      break;
    }

    return {
      team,
      label: wins >= 2 ? `${wins} victorias seguidas` : unbeaten >= 2 ? `${unbeaten} sin perder` : "Buscando racha",
      value: Math.max(wins, unbeaten)
    };
  }).sort((a, b) => b.value - a.value || a.team.name.localeCompare(b.team.name));
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

function TeamProfile({ league, selectedTeam, selectedTeamId, onSelectTeam }) {
  if (!league.teams.length) return <p className="empty">Aun no hay equipos registrados.</p>;
  if (!selectedTeam) return null;

  const players = league.players
    .filter((player) => player.teamId === selectedTeam.id)
    .sort((a, b) => Number(a.number || 999) - Number(b.number || 999) || a.name.localeCompare(b.name));
  const teamMatches = league.matches
    .filter((match) => match.homeTeamId === selectedTeam.id || match.awayTeamId === selectedTeam.id)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || Number(b.round || 0) - Number(a.round || 0));
  const nextMatch = [...teamMatches].reverse().find((match) => match.status === "scheduled");
  const lastMatch = teamMatches.find((match) => match.status === "finished" || match.status === "walkover");

  return (
    <details className="team-profile">
      <summary>
        <div className="team-profile-head compact">
          <span className="team-dot" style={{ background: selectedTeam.colors }} />
          <div>
            <strong>{selectedTeam.name}</strong>
            <span>{players.length} jugador(es) registrados</span>
          </div>
        </div>
      </summary>

      <div className="team-profile-body">
        <label>Equipo
          <select value={selectedTeamId} onChange={(event) => onSelectTeam(event.target.value)}>
            {[...league.teams].sort((a, b) => a.name.localeCompare(b.name)).map((team) => (
              <option key={team.id} value={team.id}>{team.name}</option>
            ))}
          </select>
        </label>

        <article className="team-profile-card">
          <div className="team-profile-head">
            <span className="team-dot" style={{ background: selectedTeam.colors }} />
            <div>
              <strong>{selectedTeam.name}</strong>
              <span>{selectedTeam.coach ? `ENTRENADOR: ${selectedTeam.coach}` : "ENTRENADOR SIN REGISTRAR"}</span>
            </div>
          </div>
          <div className="team-profile-facts">
            <span><strong>{players.length}</strong> Jugadores</span>
            <span><strong>{selectedTeam.status === "withdrawn" ? "BAJA" : "ACTIVO"}</strong> Estado</span>
          </div>
        </article>

        <div className="team-profile-matches">
          {nextMatch ? (
            <article>
              <span className="eyebrow">Proximo</span>
              <MatchVersus league={league} match={nextMatch} />
              <MatchMeta match={nextMatch} />
            </article>
          ) : (
            <article><span className="eyebrow">Proximo</span><strong>SIN PROGRAMAR</strong></article>
          )}
          {lastMatch ? (
            <article>
              <span className="eyebrow">Ultimo</span>
              <MatchVersus league={league} match={lastMatch} />
              <MatchMeta match={lastMatch} />
            </article>
          ) : (
            <article><span className="eyebrow">Ultimo</span><strong>SIN RESULTADO</strong></article>
          )}
        </div>

        <div className="public-squad-list">
          {players.map((player) => (
            <article key={player.id}>
              <strong>#{player.number || "-"} {player.name}</strong>
              <span>{player.position || "JUGADOR"}</span>
            </article>
          ))}
          {!players.length && <p className="empty">Este equipo aun no tiene jugadores registrados.</p>}
        </div>
      </div>
    </details>
  );
}

function TeamStreaks({ rows }) {
  if (!rows.length) return <p className="empty">Aun no hay equipos registrados.</p>;
  return (
    <div className="moment-list">
      {rows.map((row) => (
        <article key={row.team.id}>
          <strong>{row.team.name}</strong>
          <span>{row.label}</span>
        </article>
      ))}
    </div>
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

export function SectionHeading({ eyebrow, title }) {
  return (
    <div className="section-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
      </div>
    </div>
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

function StandingsTable({ rows }) {
  if (!rows.length) return <p className="empty">Aun no hay equipos registrados.</p>;

  return (
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
          {rows.map((row, index) => (
            <tr key={row.team.id}>
              <td data-label="Pos">{index + 1}</td>
              <td data-label="Equipo">{row.team.name}</td>
              <td data-label="PTS"><strong>{row.points}</strong></td>
              <td data-label="PJ">{row.played}</td>
              <td data-label="G">{row.wins}</td>
              <td data-label="E">{row.draws}</td>
              <td data-label="P">{row.losses}</td>
              <td data-label="GF">{row.goalsFor}</td>
              <td data-label="GC">{row.goalsAgainst}</td>
              <td data-label="DG">{row.goalDifference}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MatchCard({ league, match }) {
  const isFinished = match.status === "finished" || match.status === "walkover";
  const timeOrScore = isFinished ? `${match.homeGoals} - ${match.awayGoals}` : match.time || "POR DEFINIR";

  return (
    <details className="match-card">
      <summary>
        <MatchVersus league={league} match={match} />
        <strong>{timeOrScore}{!isFinished && match.time ? " HRS" : ""}</strong>
        <span className={`status ${match.status}`}>
          {match.status === "finished" ? "Finalizado" : match.status === "walkover" ? "Default" : "Programado"}
        </span>
      </summary>
      <div className="match-details">
        <MatchMeta match={match} />
        <div className="match-detail-grid">
          <span><small>Jornada</small><strong>{match.round || "-"}</strong></span>
          <span><small>{isFinished ? "Marcador" : "Horario"}</small><strong>{timeOrScore}{!isFinished && match.time ? " HRS" : ""}</strong></span>
          <span><small>Fecha</small><strong>{match.date ? formatDate(match.date) : "POR DEFINIR"}</strong></span>
          <span><small>Cancha</small><strong>{match.venue || "CANCHA POR DEFINIR"}</strong></span>
        </div>
        {match.resolutionNote && <p>{match.resolutionNote}</p>}
      </div>
    </details>
  );
}

function MatchVersus({ league, match }) {
  const home = getTeam(league, match.homeTeamId);
  const away = getTeam(league, match.awayTeamId);

  return (
    <div className="versus-line">
      <strong>{home?.name || "LOCAL"}</strong>
      <span>VS</span>
      <strong>{away?.name || "VISITANTE"}</strong>
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

function Scorers({ rows }) {
  if (!rows.length) return <p className="empty">Aun no hay goles registrados.</p>;

  return (
    <ol className="ranking-list">
      {rows.map((row) => (
        <li key={row.player.id}>
          <span>{row.player.name}<small>{row.team?.name || "Sin equipo"}</small></span>
          <strong>{row.goals}</strong>
        </li>
      ))}
    </ol>
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
          {notice.status === "active" ? (
            <p>
              {notice.type === "Expulsion" ? "Expulsado" : "Suspendido"} por {notice.totalMatches} partido(s). Le restan {notice.remainingMatches} juego(s) de suspension.
            </p>
          ) : (
            <p>Ya podra jugar la siguiente jornada; cumplio su sancion.</p>
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
  if (!rows.length) return <p className="empty">Sin tarjetas registradas.</p>;

  return (
    <div className="discipline-list">
      {rows.map((row) => (
        <article key={row.player.id}>
          <div>
            <strong>{row.player.name}</strong>
            <span>{row.team?.name || "Sin equipo"}</span>
          </div>
          <div className="cards">
            <span className="yellow">{row.yellowCards}</span>
            <span className="red">{row.redCards}</span>
          </div>
          <small>
            {row.suspensionMatches ? `${row.suspensionMatches} partido(s) de sancion` : "Sin sancion vigente"}
            {row.reasons.length ? ` | ${row.reasons.at(-1)}` : ""}
          </small>
        </article>
      ))}
    </div>
  );
}

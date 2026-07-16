import { useEffect, useMemo, useState } from "react";
import ligatecLogo from "../../assets/ligatec-logo.png";
import { getFormPayload } from "./forms.js";
import { PlayerPhotoUploader } from "./PlayerPhotoUploader.jsx";
import { SectionHeading } from "./SectionHeading.jsx";
import { uploadImage } from "../lib/uploadApi.js";
import {
  createTeamPortalPlayer,
  fetchTeamPortal,
  revealTeamMatchPin,
  signTeamMatchReport,
  submitTeamMatchRoster,
  updateTeamPortalLogo,
  updateTeamPortalPlayer
} from "../lib/teamDelegateApi.js";
import { getPlayerPhotoInitials } from "../lib/playerPhotoProcessing.js";

const PLAYER_POSITION_OPTIONS = ["Arquero", "Defensor", "Mediocampista", "Delantero"];

function getTeamInitials(name) {
  const words = String(name || "EQ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return "EQ";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words.slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

function formatMatchDate(match) {
  const date = match?.date || "Fecha por definir";
  const time = match?.time || "Hora por definir";
  return `${date} | ${time}`;
}

function getDelegateMatchStatus(match) {
  if (!match) return { tone: "neutral", label: "Sin partido", detail: "No hay partido seleccionado", step: 1 };
  if (match.status === "finished" || match.status === "walkover" || match.reportStatus === "published") {
    return { tone: "published", label: "Publicado", detail: "Resultado oficial disponible", step: 6 };
  }
  if (match.status === "postponed") {
    return { tone: "warning", label: "Pospuesto", detail: match.scheduleNote || "La liga indicara nueva fecha u horario.", step: 1 };
  }
  if (match.status === "advanced") {
    return { tone: "live", label: "Adelantado", detail: match.scheduleNote || "El partido fue movido a una fecha anterior.", step: match.roster ? 2 : 1 };
  }
  if (match.status === "rescheduled") {
    return { tone: "sent", label: "Reprogramado", detail: match.scheduleNote || "El partido tiene nueva fecha u horario.", step: match.roster ? 2 : 1 };
  }
  if (match.myTeamSigned && match.opponentSigned) {
    return { tone: "signed", label: "Firmado", detail: "Ambos equipos firmaron el acta", step: 5 };
  }
  if (match.myTeamSigned) {
    return { tone: "signed", label: "Mi equipo firmo", detail: "Esperando firma rival o cierre arbitral", step: 5 };
  }
  if (["pending_captain_review", "both_signed", "correction_requested"].includes(match.reportStatus)) {
    return { tone: "warning", label: "Pendiente de firma", detail: "Revisa el acta y firma con tu PIN", step: 4 };
  }
  if (["in_progress", "match_finished", "temporarily_saved"].includes(match.workflowStatus || "")) {
    return { tone: "live", label: "En curso", detail: "El arbitro esta capturando el partido", step: 3 };
  }
  if (match.roster) {
    return { tone: "sent", label: "Convocatoria enviada", detail: "Lista y PIN generados para este partido", step: 2 };
  }
  return { tone: "pending", label: "Convocatoria pendiente", detail: "Selecciona jugadores, capitan y portero", step: 1 };
}

function getTeamScore(match) {
  if (!match) return { own: 0, opponent: 0 };
  const homeGoals = Number(match.homeGoals ?? 0);
  const awayGoals = Number(match.awayGoals ?? 0);
  return match.isHome
    ? { own: homeGoals, opponent: awayGoals }
    : { own: awayGoals, opponent: homeGoals };
}

function getReportEvents(match) {
  const events = Array.isArray(match?.reportPayload?.events) ? match.reportPayload.events : [];
  return events.slice().reverse();
}

function getReportEventIcon(event) {
  const type = event?.type;
  if (event?.cardDetail === "double_yellow") return "🟨🟥";
  if (type === "yellow" || type === "yellow_card") return "🟨";
  if (type === "red" || type === "red_card") return "🟥";
  if (type === "substitution") return "🔄";
  if (type === "incident") return "⚠";
  return "⚽";
}

function getReportEventLabel(event) {
  if (event.type === "own_goal") return "Autogol";
  if (event.type === "yellow" || event.type === "yellow_card") return "Amarilla";
  if (event.type === "red" || event.type === "red_card") return "Roja";
  if (event.type === "substitution") return "Cambio";
  if (event.type === "incident") return "Incidente";
  return "Gol";
}

function normalizePinInput(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 8);
}

function getDelegateViewLabel(activeView, navItems) {
  if (activeView === "acta") return "Seguimiento del acta";
  if (activeView === "player") return "Editar jugador";
  if (activeView === "newPlayer") return "Nuevo jugador";
  return navItems.find((item) => item.id === activeView)?.label || "Inicio";
}

function getDelegateNextAction(match, status) {
  if (!match) {
    return {
      tone: "neutral",
      eyebrow: "Proxima accion",
      title: "Esperar calendario",
      detail: "Cuando la liga publique un partido para tu equipo, aparecera aqui como prioridad.",
      button: "Ver partidos",
      target: "matches"
    };
  }
  if (match.status === "postponed") {
    return {
      tone: "warning",
      eyebrow: "Seguimiento",
      title: "Partido pospuesto",
      detail: match.scheduleNote || "La liga pausó este partido. La convocatoria se conserva y se reactivara cuando se reprograme.",
      button: "Ver partidos",
      target: "matches"
    };
  }
  if (!match.roster) {
    return {
      tone: "warning",
      eyebrow: "Proxima accion",
      title: "Enviar convocatoria",
      detail: "Selecciona jugadores, titulares, capitan y portero para que el arbitro pueda validar el partido.",
      button: "Mandar plantilla",
      target: "lineup"
    };
  }
  if (["pending_captain_review", "correction_requested", "both_signed"].includes(match.reportStatus) && !match.myTeamSigned) {
    return {
      tone: "warning",
      eyebrow: "Proxima accion",
      title: "Revisar y firmar acta",
      detail: "El acta ya esta disponible. Revisa eventos, resultado y firma con el PIN del capitan.",
      button: "Ir a firma",
      target: "acta"
    };
  }
  if (match.myTeamSigned && !match.opponentSigned && !["published", "finished"].includes(match.reportStatus || "")) {
    return {
      tone: "signed",
      eyebrow: "Seguimiento",
      title: "Esperando firma rival",
      detail: "Tu equipo ya firmo. El acta queda pendiente de la otra firma o cierre arbitral.",
      button: "Ver seguimiento",
      target: "acta"
    };
  }
  if (["in_progress", "match_finished", "temporarily_saved"].includes(match.workflowStatus || "")) {
    return {
      tone: "live",
      eyebrow: "Seguimiento",
      title: "Partido en captura",
      detail: "El arbitro esta trabajando el acta. Puedes consultar el avance y el estado de firmas.",
      button: "Ver seguimiento",
      target: "acta"
    };
  }
  if (match.reportStatus === "published" || match.status === "finished" || status?.tone === "published") {
    return {
      tone: "published",
      eyebrow: "Resultado",
      title: "Acta publicada",
      detail: "El resultado ya quedo oficial y disponible para consulta publica.",
      button: "Ver acta",
      target: "acta"
    };
  }
  return {
    tone: "sent",
    eyebrow: "Proxima accion",
    title: "Convocatoria enviada",
    detail: "Tu equipo ya completo la convocatoria. Mantente atento al inicio de captura y al acta preliminar.",
    button: "Ver seguimiento",
    target: "acta"
  };
}

function isDelegateMatchOperational(match) {
  return ["scheduled", "rescheduled", "advanced"].includes(match?.status || "scheduled");
}

function getScheduleChangeText(match) {
  if (!["postponed", "rescheduled", "advanced"].includes(match?.status || "")) return "";
  const previous = [match.originalDate, match.originalTime].filter(Boolean).join(" | ");
  if (match.status === "postponed") return match.scheduleNote || "Pendiente de nueva programacion";
  const prefix = match.status === "advanced" ? "Adelantado" : "Reprogramado";
  return previous ? `${prefix} desde ${previous}` : (match.scheduleNote || prefix);
}

function TeamBadge({ logoUrl, name, tone = "home" }) {
  return (
    <span className={`portal-team-badge ${tone}`}>
      {logoUrl ? <img alt="" src={logoUrl} /> : <b>{getTeamInitials(name)}</b>}
    </span>
  );
}

function PortalNavIcon({ type }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    strokeWidth: 2,
    viewBox: "0 0 24 24",
    "aria-hidden": "true"
  };
  if (type === "teams") {
    return <svg {...common}><path d="M16 21v-2a4 4 0 0 0-8 0v2" /><circle cx="12" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
  }
  if (type === "matches") {
    return <svg {...common}><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M16 2v4" /><path d="M8 2v4" /><path d="M3 10h18" /><path d="m9 16 2 2 4-4" /></svg>;
  }
  if (type === "history") {
    return <svg {...common}><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /><path d="M12 7v5l3 2" /></svg>;
  }
  if (type === "more") {
    return <svg {...common}><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg>;
  }
  return <svg {...common}><path d="M3 11 12 3l9 8" /><path d="M5 10v10h14V10" /><path d="M9 20v-6h6v6" /></svg>;
}

function getTeamPortalCacheKey(userId) {
  return `ligatec-team-portal-cache-${userId || "anonymous"}`;
}

function readTeamPortalCache(userId) {
  if (typeof window === "undefined" || !userId) return null;
  try {
    const raw = window.localStorage.getItem(getTeamPortalCacheKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.payload || null;
  } catch {
    return null;
  }
}

function writeTeamPortalCache(userId, payload) {
  if (typeof window === "undefined" || !userId || !payload) return;
  try {
    window.localStorage.setItem(getTeamPortalCacheKey(userId), JSON.stringify({
      payload,
      savedAt: new Date().toISOString()
    }));
  } catch {
    // El portal sigue funcionando aunque el navegador no permita guardar cache local.
  }
}

function getPlayerPositionOptionValue(position) {
  const normalized = String(position || "").toLocaleUpperCase("es-MX");
  if (normalized.includes("ARQUERO") || normalized.includes("PORTERO")) return "Arquero";
  if (normalized.includes("DEFENSOR") || normalized.includes("DEFENSA")) return "Defensor";
  if (normalized.includes("MEDIOCAMPISTA") || normalized.includes("MEDIO")) return "Mediocampista";
  if (normalized.includes("DELANTERO")) return "Delantero";
  return "Delantero";
}

function DelegateLoadingShell() {
  return (
    <main className="page team-portal-page portal-loading-page">
      <section className="portal-loading-card">
        <img alt="LIGATEC" src={ligatecLogo} />
        <span>Panel delegado</span>
        <strong>Preparando tu equipo</strong>
        <small>Sincronizando plantilla, partidos y actas.</small>
        <div className="portal-loading-bars" aria-hidden="true">
          <b />
          <b />
          <b />
        </div>
      </section>
    </main>
  );
}

export function TeamPortal({ authToken, currentUser, onLogout }) {
  const initialPayload = useMemo(() => readTeamPortalCache(currentUser?.id), [currentUser?.id]);
  const [context, setContext] = useState(initialPayload?.context || null);
  const [players, setPlayers] = useState(initialPayload?.players || []);
  const [eligiblePlayers, setEligiblePlayers] = useState(initialPayload?.eligiblePlayers || []);
  const [matches, setMatches] = useState(initialPayload?.matches || []);
  const [rosterDrafts, setRosterDrafts] = useState(
    initialPayload ? buildRosterDrafts(initialPayload.matches || [], initialPayload.eligiblePlayers || []) : {}
  );
  const [loading, setLoading] = useState(!initialPayload);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [photoResetKey, setPhotoResetKey] = useState(0);
  const [playerQuery, setPlayerQuery] = useState("");
  const [positionFilter, setPositionFilter] = useState("");
  const [editingPlayerId, setEditingPlayerId] = useState("");
  const [busyPlayerId, setBusyPlayerId] = useState("");
  const [busyMatchId, setBusyMatchId] = useState("");
  const [busyPinMatchId, setBusyPinMatchId] = useState("");
  const [visiblePinsByMatchId, setVisiblePinsByMatchId] = useState({});
  const [teamLogoResetKey, setTeamLogoResetKey] = useState(0);
  const [activeView, setActiveView] = useState("home");
  const [selectedMatchId, setSelectedMatchId] = useState("");
  const [signaturePin, setSignaturePin] = useState("");
  const [signingMatchId, setSigningMatchId] = useState("");
  const filteredPlayers = useMemo(() => {
    const query = normalizeSearch(playerQuery);
    return players.filter((player) => {
      const matchesQuery = !query || normalizeSearch(`${player.name} ${player.number || ""}`).includes(query);
      const playerPosition = getPlayerPositionOptionValue(player.position);
      const matchesPosition = !positionFilter || playerPosition === positionFilter;
      return matchesQuery && matchesPosition;
    });
  }, [playerQuery, players, positionFilter]);
  const selectedMatch = useMemo(
    () => matches.find((match) => match.id === selectedMatchId) || matches[0] || null,
    [matches, selectedMatchId]
  );
  const selectedEditingPlayer = useMemo(
    () => players.find((player) => player.id === editingPlayerId) || null,
    [editingPlayerId, players]
  );

  useEffect(() => {
    let cancelled = false;
    const cachedPayload = readTeamPortalCache(currentUser?.id);
    if (cachedPayload) {
      applyPortalPayload(cachedPayload);
      setLoading(false);
    } else {
      setLoading(true);
    }
    fetchTeamPortal(authToken)
      .then((payload) => {
        if (cancelled) return;
        applyPortalPayload(payload);
        writeTeamPortalCache(currentUser?.id, payload);
        setError("");
      })
      .catch((loadError) => {
        if (cancelled) return;
        const fallbackPayload = cachedPayload || readTeamPortalCache(currentUser?.id);
        if (fallbackPayload) {
          applyPortalPayload(fallbackPayload);
          setNotice("Sin conexion. Mostrando la ultima informacion guardada en este dispositivo.");
          setError("");
          return;
        }
        setError(loadError.message || "No se pudo cargar el portal.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authToken, currentUser?.id]);

  useEffect(() => {
    if (!matches.length) {
      setSelectedMatchId("");
      return;
    }
    setSelectedMatchId((current) => matches.some((match) => match.id === current) ? current : matches[0].id);
  }, [matches]);

  function applyPortalPayload(payload) {
    const nextEligiblePlayers = payload.eligiblePlayers || [];
    const nextMatches = payload.matches || [];
    setContext(payload.context);
    setPlayers(payload.players || []);
    setEligiblePlayers(nextEligiblePlayers);
    setMatches(nextMatches);
    setRosterDrafts(buildRosterDrafts(nextMatches, nextEligiblePlayers));
  }

  async function submitPlayer(event) {
    event.preventDefault();
    if (!context?.canManageRoster) return;

    const form = event.currentTarget;
    const payload = getFormPayload(form);
    setNotice("Guardando jugador...");
    setError("");

    try {
      const photoPayload = await buildImageUploadPayload(payload, "", authToken, context.leagueId, "player-photos");

      const response = await createTeamPortalPlayer(authToken, {
        name: payload.name,
        number: payload.number,
        position: payload.position,
        ...photoPayload
      });
      applyPortalPayload(response);
      writeTeamPortalCache(currentUser?.id, response);
      setNotice("Jugador registrado correctamente.");
      form.reset();
      setPhotoResetKey((value) => value + 1);
      setActiveView("roster");
    } catch (saveError) {
      setNotice("");
      setError(saveError.message || "No se pudo registrar el jugador.");
    }
  }

  async function submitPlayerEdit(event, player) {
    event.preventDefault();
    if (!context?.canManageRoster || busyPlayerId) return;

    const payload = getFormPayload(event.currentTarget);
    setBusyPlayerId(player.id);
    setNotice("Actualizando jugador...");
    setError("");

    try {
      const photoPayload = await buildImageUploadPayload(payload, player.photoUrl || "", authToken, context.leagueId, "player-photos");
      const response = await updateTeamPortalPlayer(authToken, player.id, {
        name: payload.name,
        number: payload.number,
        position: payload.position,
        ...photoPayload
      });
      applyPortalPayload(response);
      writeTeamPortalCache(currentUser?.id, response);
      setEditingPlayerId("");
      setActiveView("roster");
      setNotice("Jugador actualizado correctamente.");
    } catch (saveError) {
      setNotice("");
      setError(saveError.message || "No se pudo actualizar el jugador.");
    } finally {
      setBusyPlayerId("");
    }
  }

  async function submitTeamLogo(event) {
    event.preventDefault();
    if (!context) return;
    const payload = getFormPayload(event.currentTarget);
    setNotice("Actualizando escudo...");
    setError("");

    try {
      const imagePayload = await buildImageUploadPayload(payload, context.teamLogoUrl || "", authToken, context.leagueId, "team-logos");
      const response = await updateTeamPortalLogo(authToken, { logoUrl: imagePayload.photoUrl });
      applyPortalPayload(response);
      writeTeamPortalCache(currentUser?.id, response);
      setTeamLogoResetKey((value) => value + 1);
      setNotice("Escudo actualizado correctamente.");
    } catch (saveError) {
      setNotice("");
      setError(saveError.message || "No se pudo actualizar el escudo.");
    }
  }

  function updateRosterDraft(matchId, updater) {
    setRosterDrafts((current) => ({
      ...current,
      [matchId]: updater(current[matchId] || { playerIds: [], starters: [], substitutes: [], captainPlayerId: "", goalkeeperPlayerId: "", notes: "" })
    }));
  }

  async function submitMatchRoster(event, match) {
    event.preventDefault();
    if (busyMatchId) return;
    const draft = rosterDrafts[match.id] || { playerIds: [], starters: [], substitutes: [], captainPlayerId: "", goalkeeperPlayerId: "", notes: "" };
    if (!draft.playerIds.length) {
      setError("Selecciona al menos un jugador para enviar la convocatoria.");
      return;
    }
    if (!draft.captainPlayerId || !draft.playerIds.includes(draft.captainPlayerId)) {
      setError("Selecciona un capitan dentro de la convocatoria.");
      return;
    }
    if (!draft.goalkeeperPlayerId || !draft.playerIds.includes(draft.goalkeeperPlayerId)) {
      setError("Selecciona un portero dentro de la convocatoria.");
      return;
    }
    const starterSet = new Set(draft.starters || []);
    const substituteSet = new Set(draft.substitutes || []);
    const missingRolePlayerId = draft.playerIds.find((playerId) => !starterSet.has(playerId) && !substituteSet.has(playerId));
    if (missingRolePlayerId) {
      setError(`${getEligiblePlayerName(eligiblePlayers, missingRolePlayerId)} debe estar como titular o suplente.`);
      return;
    }
    const confirmed = window.confirm(`¿Enviar convocatoria de ${context.teamName} vs ${match.opponentName}?\n\nJugadores: ${draft.playerIds.length}\nTitulares: ${(draft.starters || []).length}\nSuplentes: ${(draft.substitutes || []).length}\nCapitan: ${getEligiblePlayerName(eligiblePlayers, draft.captainPlayerId)}\nPortero: ${getEligiblePlayerName(eligiblePlayers, draft.goalkeeperPlayerId)}\n\nEl arbitro vera esta lista para capturar el acta.`);
    if (!confirmed) return;

    setBusyMatchId(match.id);
    setNotice("Enviando convocatoria...");
    setError("");
    try {
      const response = await submitTeamMatchRoster(authToken, match.id, draft);
      applyPortalPayload(response);
      writeTeamPortalCache(currentUser?.id, response);
      setNotice("Plantilla enviada exitosamente.");
    } catch (saveError) {
      setNotice("");
      setError(saveError.message || "No se pudo enviar la convocatoria.");
    } finally {
      setBusyMatchId("");
    }
  }

  async function revealMatchPin(match, options = {}) {
    if (busyPinMatchId) return;
    if (!options.reportFollowup) return;

    setBusyPinMatchId(match.id);
    setNotice("Mostrando PIN del capitan...");
    setError("");
    try {
      const response = await revealTeamMatchPin(authToken, match.id, { source: "report_followup" });
      if (response.payload) {
        applyPortalPayload(response.payload);
        writeTeamPortalCache(currentUser?.id, response.payload);
      }
      setVisiblePinsByMatchId((current) => ({ ...current, [match.id]: response.pin || "" }));
      setNotice("PIN mostrado. Compartelo solo al validar el acta.");
    } catch (pinError) {
      setNotice("");
      setError(pinError.message || "No se pudo mostrar el PIN.");
    } finally {
      setBusyPinMatchId("");
    }
  }

  async function submitReportSignature(event) {
    event.preventDefault();
    if (!activeMatch || signingMatchId) return;
    const pin = normalizePinInput(signaturePin);
    if (pin.length < 4) {
      setError("Ingresa el PIN del capitan para firmar el acta.");
      return;
    }

    setSigningMatchId(activeMatch.id);
    setNotice("Firmando acta...");
    setError("");
    try {
      const response = await signTeamMatchReport(authToken, activeMatch.id, { pin });
      if (response.payload) {
        applyPortalPayload(response.payload);
        writeTeamPortalCache(currentUser?.id, response.payload);
      }
      setSignaturePin("");
      setNotice(response.readyToFinalize ? "Acta firmada. Ambos equipos ya completaron firmas." : "Acta firmada correctamente.");
    } catch (signError) {
      setNotice("");
      setError(signError.message || "No se pudo firmar el acta.");
    } finally {
      setSigningMatchId("");
    }
  }

  if (loading) {
    return <DelegateLoadingShell />;
  }

  if (error && !context) {
    return (
      <main className="page team-portal-page">
        <section className="panel">
          <SectionHeading eyebrow="Portal de equipo" title="No disponible" />
          <p className="auth-error">{error}</p>
        </section>
      </main>
    );
  }

  const upcomingMatches = matches.filter((match) => match.status !== "finished" && match.status !== "walkover" && match.reportStatus !== "published");
  const operationalUpcomingMatches = upcomingMatches.filter(isDelegateMatchOperational);
  const nextMatch = operationalUpcomingMatches[0] || upcomingMatches[0] || matches[0] || null;
  const submittedRosters = matches.filter((match) => match.roster).length;
  const openRosterMatches = matches.filter((match) => !match.roster).length;
  const positionCounts = PLAYER_POSITION_OPTIONS.map((position) => ({
    position,
    count: players.filter((player) => getPlayerPositionOptionValue(player.position) === position).length
  }));
  const nextMatchStatus = getDelegateMatchStatus(nextMatch);
  const activeMatch = selectedMatch || nextMatch;
  const activeMatchStatus = getDelegateMatchStatus(activeMatch);
  const activeScore = getTeamScore(activeMatch);
  const activeHomeTeamName = activeMatch ? (activeMatch.isHome ? context.teamName : activeMatch.opponentName) : "";
  const activeAwayTeamName = activeMatch ? (activeMatch.isHome ? activeMatch.opponentName : context.teamName) : "";
  const activeReportPayload = activeMatch?.reportPayload && typeof activeMatch.reportPayload === "object" ? activeMatch.reportPayload : {};
  const activeReportEvents = getReportEvents(activeMatch);
  const activeReportCanSign = Boolean(
    activeMatch?.roster &&
    activeMatch.captureMode === "live" &&
    !activeMatch.myTeamSigned &&
    ["pending_captain_review", "correction_requested", "both_signed"].includes(activeMatch.reportStatus)
  );
  const activeDraft = activeMatch
    ? rosterDrafts[activeMatch.id] || { playerIds: [], starters: [], substitutes: [], captainPlayerId: "", goalkeeperPlayerId: "", notes: "" }
    : { playerIds: [], starters: [], substitutes: [], captainPlayerId: "", goalkeeperPlayerId: "", notes: "" };
  const activeAvailablePlayers = activeMatch
    ? eligiblePlayers.filter((player) => {
        const blockedBySuspension = Boolean(player.suspension);
        const blockedByPlayoff = activeMatch.isPlayoff && player.playoffEligibility?.applies && !player.playoffEligibility?.eligible;
        return !blockedBySuspension && !blockedByPlayoff;
      })
    : [];
  const navItems = [
    { id: "home", label: "Inicio", icon: "home" },
    { id: "roster", label: "Plantilla", icon: "teams" },
    { id: "matches", label: "Partidos", icon: "matches" },
    { id: "lineup", label: "Convocatoria", icon: "history" },
    { id: "tools", label: "Mas", icon: "more" }
  ];
  const isActaView = activeView === "acta";
  const isPlayerEditView = activeView === "player";
  const isPlayerCreateView = activeView === "newPlayer";
  const isExclusiveView = isActaView || isPlayerEditView || isPlayerCreateView;
  const activeReferees = activeMatch ? [
    ["Arbitro central", activeMatch.centralRefereeName],
    ["Auxiliar 1", activeMatch.assistantReferee1Name],
    ["Auxiliar 2", activeMatch.assistantReferee2Name],
    ["Cuarto arbitro", activeMatch.fourthRefereeName]
  ].filter(([, name]) => name) : [];
  const nextAction = getDelegateNextAction(nextMatch, nextMatchStatus);
  const nextActionChecks = nextMatch ? [
    { label: "Convocatoria enviada", done: Boolean(nextMatch.roster) },
    { label: "Rival convocado", done: Boolean(nextMatch.opponentRosterSubmitted) },
    { label: "Acta activa", done: nextMatchStatus.step >= 3 },
    { label: "Firma del equipo", done: Boolean(nextMatch.myTeamSigned) }
  ] : [
    { label: "Plantilla lista", done: players.length > 0 },
    { label: "Calendario pendiente", done: false }
  ];
  const openMatchWorkflow = (match) => {
    if (!match) return;
    setSelectedMatchId(match.id);
    if (!isDelegateMatchOperational(match)) {
      setActiveView("matches");
      return;
    }
    setActiveView(match.roster ? "acta" : "lineup");
  };
  const openDelegateNextAction = () => {
    if (nextAction.target === "lineup" && nextMatch) {
      setSelectedMatchId(nextMatch.id);
      setActiveView("lineup");
      return;
    }
    if (nextAction.target === "acta" && nextMatch) {
      setSelectedMatchId(nextMatch.id);
      setActiveView("acta");
      return;
    }
    setActiveView(nextAction.target || "matches");
  };

  return (
    <main className={`page team-portal-page portal-mobile-shell portal-board-shell delegate-view-${activeView} ${isExclusiveView ? "delegate-acta-exclusive-page" : ""}`} id="delegate-home">
      <div className="portal-board-layout delegate-board">
        <section className={`delegate-phone-frame ${isExclusiveView ? "delegate-acta-frame" : ""}`}>
          {!isActaView && <div className="delegate-app-header">
            {activeView === "home" ? (
              <span className="delegate-app-logo">
                <img alt="LIGATEC" src={ligatecLogo} />
              </span>
            ) : (
              <button
                className="delegate-back-button"
                type="button"
                onClick={() => {
                  if (isPlayerEditView || isPlayerCreateView) {
                    setEditingPlayerId("");
                    setActiveView("roster");
                    return;
                  }
                  setActiveView("home");
                }}
                aria-label={isPlayerEditView || isPlayerCreateView ? "Regresar a plantilla" : "Regresar al inicio"}
              >
                ‹
              </button>
            )}
            <div>
              <small>{activeView === "home" ? "Panel delegado" : String(getDelegateViewLabel(activeView, navItems))}</small>
              <strong>{isPlayerEditView ? selectedEditingPlayer?.name || "Jugador" : isPlayerCreateView ? "Agregar jugador" : context.teamName}</strong>
              <em>{isPlayerEditView ? `#${selectedEditingPlayer?.number || "-"} ${getPlayerPositionOptionValue(selectedEditingPlayer?.position)}` : isPlayerCreateView ? "Plantilla del equipo" : context.competitionName || "Categoria asignada"}</em>
            </div>
            {activeView === "home" && <button className="delegate-logout-button" type="button" onClick={onLogout}>Salir</button>}
          </div>}

          {notice && <p className="auth-ok">{notice}</p>}
          {error && <p className="auth-error">{error}</p>}

          {activeView === "home" && (
            <div className="delegate-view-stack">
              {nextMatch ? (
                <article className="portal-next-match-card delegate-feature-match">
                  <div className="portal-card-head">
                    <strong>Jornada en curso</strong>
                    <span className={`portal-status-pill ${nextMatchStatus.tone}`}>{nextMatchStatus.label}</span>
                  </div>
                  <span className="portal-match-date">{formatMatchDate(nextMatch)}</span>
                  <div className="portal-match-teams">
                    <div>
                      <TeamBadge logoUrl={context.teamLogoUrl} name={context.teamName} />
                      <strong>{context.teamName}</strong>
                      <small>{nextMatch.isHome ? "Local" : "Visitante"}</small>
                    </div>
                    <b>VS</b>
                    <div>
                      <TeamBadge name={nextMatch.opponentName} tone="away" />
                      <strong>{nextMatch.opponentName}</strong>
                      <small>{nextMatch.isHome ? "Visitante" : "Local"}</small>
                    </div>
                  </div>
                  <div className="portal-match-meta">
                    <span>Jornada {nextMatch.round || "-"}</span>
                    <span>{nextMatch.venue || "Cancha por definir"}</span>
                    <span>{nextMatch.captureMode === "manual" ? "Acta manual" : "Acta digital"}</span>
                  </div>
                  {getScheduleChangeText(nextMatch) && <small className="delegate-schedule-note">{getScheduleChangeText(nextMatch)}</small>}
                  <button className="portal-primary-action" type="button" onClick={() => openMatchWorkflow(nextMatch)}>
                    {!isDelegateMatchOperational(nextMatch) ? "Ver partidos" : nextMatch.roster ? "Ver acta y firmas" : "Mandar plantilla"}
                  </button>
                  <small className="portal-card-note">{nextMatchStatus.detail}</small>
                </article>
              ) : (
                <article className="portal-next-match-card">
                  <div className="portal-card-head">
                    <strong>Proximo partido</strong>
                    <span className="portal-status-pill neutral">Sin programar</span>
                  </div>
                  <p className="helper-text">Cuando la liga publique una jornada para tu equipo, aparecera aqui.</p>
                </article>
              )}

              <article className={`delegate-next-action-card ${nextAction.tone}`}>
                <div>
                  <span>{nextAction.eyebrow}</span>
                  <strong>{nextAction.title}</strong>
                  <small>{nextAction.detail}</small>
                </div>
                <button type="button" onClick={openDelegateNextAction}>{nextAction.button}</button>
                <div className="delegate-next-action-checks">
                  {nextActionChecks.map((item) => (
                    <span className={item.done ? "done" : ""} key={item.label}>
                      <b>{item.done ? "✓" : "•"}</b>
                      {item.label}
                    </span>
                  ))}
                </div>
              </article>

              <div className="delegate-stat-grid">
                <span><b>{players.length}</b> Plantilla</span>
                <span><b>{submittedRosters}</b> Enviadas</span>
                <span><b>{openRosterMatches}</b> Pendientes</span>
              </div>

              <div className="portal-flow-strip delegate compact" aria-label="Flujo del delegado">
                {["Conv.", "Curso", "Acta", "Firma", "Publ."].map((label, index) => (
                  <span className={nextMatchStatus.step >= index + 1 ? "active" : ""} key={label}><b>{index + 1}</b> {label}</span>
                ))}
              </div>
            </div>
          )}

          {activeView === "matches" && (
            <div className="delegate-view-stack">
              <div className="delegate-compact-list">
                {matches.map((match) => {
                  const status = getDelegateMatchStatus(match);
                  const score = getTeamScore(match);
                  return (
                    <button
                      className={selectedMatchId === match.id ? "selected" : ""}
                      key={match.id}
                      type="button"
                      onClick={() => setSelectedMatchId(match.id)}
                    >
                      <span>
                        <strong>{context.teamName} vs {match.opponentName}</strong>
                        <small>{formatMatchDate(match)} | {match.venue || "Cancha por definir"}</small>
                      </span>
                      <b>{match.status === "finished" || match.reportStatus === "published" ? `${score.own}-${score.opponent}` : status.label}</b>
                    </button>
                  );
                })}
                {!matches.length && <p className="empty">No hay partidos programados para este equipo.</p>}
              </div>
              {activeMatch && (
                <article className="delegate-match-detail">
                  <span className={`portal-status-pill ${activeMatchStatus.tone}`}>{activeMatchStatus.label}</span>
                  <strong>{activeMatchStatus.detail}</strong>
                  <small>{activeMatch.opponentRosterSubmitted ? "El rival ya envio convocatoria." : "Convocatoria rival pendiente."}</small>
                  {getScheduleChangeText(activeMatch) && <small>{getScheduleChangeText(activeMatch)}</small>}
                  <button className="portal-primary-action" type="button" disabled={!isDelegateMatchOperational(activeMatch)} onClick={() => setActiveView(activeMatch.roster ? "acta" : "lineup")}>
                    {!isDelegateMatchOperational(activeMatch) ? "Partido pospuesto" : activeMatch.roster ? "Ver seguimiento del acta" : "Crear convocatoria"}
                  </button>
                </article>
              )}
            </div>
          )}

          {activeView === "acta" && (
            <div className="delegate-view-stack delegate-acta-screen">
              {activeMatch ? (
                <>
                  <div className="delegate-acta-exclusive-head">
                    <button type="button" onClick={() => setActiveView("home")} aria-label="Regresar al panel delegado">‹</button>
                    <div>
                      <strong>Acta del partido</strong>
                      <small>{activeHomeTeamName} vs {activeAwayTeamName}</small>
                    </div>
                  </div>
                  <article className="delegate-acta-hero">
                    <img className="delegate-acta-watermark" alt="" src={ligatecLogo} aria-hidden="true" />
                    <div className="portal-card-head">
                      <span className={`portal-status-pill ${activeMatchStatus.tone}`}>{activeMatchStatus.label}</span>
                    </div>
                    <strong>Resumen del acta</strong>
                    <small>{formatMatchDate(activeMatch)} | Jornada {activeMatch.round || "-"} | {activeMatch.venue || "Cancha por definir"}</small>
                    <div className="delegate-sign-score delegate-acta-score">
                      <span>{activeHomeTeamName}</span>
                      <b>{Number(activeMatch.homeGoals ?? 0)} - {Number(activeMatch.awayGoals ?? 0)}</b>
                      <span>{activeAwayTeamName}</span>
                    </div>
                    <div className="delegate-acta-summary-grid">
                      <span><small>Eventos</small><strong>{activeReportEvents.length}</strong></span>
                      <span><small>Tiempo extra</small><strong>{activeReportPayload.extraTimeEnabled ? `${activeReportPayload.extraTimeHomeGoals ?? 0} - ${activeReportPayload.extraTimeAwayGoals ?? 0}` : "No"}</strong></span>
                      <span><small>Penales</small><strong>{activeReportPayload.penaltiesEnabled ? `${activeReportPayload.penaltyHomeGoals ?? 0} - ${activeReportPayload.penaltyAwayGoals ?? 0}` : "No"}</strong></span>
                    </div>
                    <p>{activeMatch.reportPayload?.observations || "Sin observaciones registradas por ahora."}</p>
                  </article>

                  <article className="delegate-match-detail delegate-acta-details">
                    <div className="portal-card-head">
                      <strong>Datos del partido</strong>
                      <span>{activeMatch.captureMode === "manual" ? "Acta manual" : "Acta digital"}</span>
                    </div>
                    <div className="delegate-acta-detail-grid">
                      <span><small>Fecha</small><strong>{activeMatch.date || "Por definir"}</strong></span>
                      <span><small>Hora</small><strong>{activeMatch.time || "Por definir"}</strong></span>
                      <span><small>Cancha</small><strong>{activeMatch.venue || "Por definir"}</strong></span>
                      <span><small>Jornada</small><strong>{activeMatch.round || "-"}</strong></span>
                    </div>
                    {activeReferees.length > 0 && (
                      <div className="delegate-acta-officials">
                        <strong>Cuerpo arbitral</strong>
                        {activeReferees.map(([label, name]) => (
                          <span key={label}><small>{label}</small><b>{name}</b></span>
                        ))}
                      </div>
                    )}
                  </article>

                  <article className="delegate-match-detail">
                    <div className="portal-card-head">
                      <strong>Eventos registrados</strong>
                      <span>{activeReportEvents.length}</span>
                    </div>
                    <div className="delegate-acta-mini-events full">
                      {activeReportEvents.map((eventItem, index) => (
                        <span key={`${eventItem.id || eventItem.minute || index}-${index}`}>
                          <b>{getReportEventIcon(eventItem)}</b>
                          <strong>{eventItem.minuteLabel || eventItem.minute || "--"}</strong>
                          <small>{getReportEventLabel(eventItem)} {eventItem.playerName || eventItem.player || ""}</small>
                        </span>
                      ))}
                      {!activeReportEvents.length && <small>No hay eventos registrados en el acta preliminar.</small>}
                    </div>
                  </article>

                  <article className="delegate-sign-card">
                    <div className="portal-card-head">
                      <strong>Firma digital</strong>
                      <span className={`portal-status-pill ${activeMatch.myTeamSigned ? "signed" : activeReportCanSign ? "warning" : "neutral"}`}>
                        {activeMatch.myTeamSigned ? "Firmada" : activeReportCanSign ? "Pendiente" : "No disponible"}
                      </span>
                    </div>
                    <div className="delegate-acta-pin-row">
                      <span>
                        <small>PIN del capitan</small>
                        <strong>{visiblePinsByMatchId[activeMatch.id] || "------"}</strong>
                      </span>
                      <button type="button" onClick={() => revealMatchPin(activeMatch, { reportFollowup: true })} disabled={!activeMatch.roster?.captainPin || busyPinMatchId === activeMatch.id}>
                        {busyPinMatchId === activeMatch.id ? "Mostrando..." : "Mostrar PIN"}
                      </button>
                    </div>
                    {activeMatch.myTeamSigned ? (
                      <p className="delegate-sign-note">Tu equipo ya firmo esta acta. El arbitro vera la firma automaticamente en su panel.</p>
                    ) : (
                      <form className="delegate-acta-sign-form" onSubmit={submitReportSignature}>
                        <label>Capturar PIN para firmar
                          <input
                            inputMode="numeric"
                            maxLength={8}
                            placeholder="6 digitos"
                            type="password"
                            value={signaturePin}
                            onChange={(event) => setSignaturePin(normalizePinInput(event.target.value))}
                          />
                        </label>
                        <button className="portal-primary-action" type="submit" disabled={!activeReportCanSign || signingMatchId === activeMatch.id}>
                          {signingMatchId === activeMatch.id ? "Firmando..." : "Firmar acta"}
                        </button>
                      </form>
                    )}
                  </article>
                </>
              ) : (
                <p className="empty">Selecciona un partido para revisar el acta.</p>
              )}
            </div>
          )}

          {activeView === "lineup" && (
            <div className="delegate-view-stack">
              {activeMatch && !isDelegateMatchOperational(activeMatch) ? (
                <article className="delegate-match-detail">
                  <span className={`portal-status-pill ${activeMatchStatus.tone}`}>{activeMatchStatus.label}</span>
                  <strong>{context.teamName} vs {activeMatch.opponentName}</strong>
                  <small>{getScheduleChangeText(activeMatch) || activeMatchStatus.detail}</small>
                  <button className="portal-primary-action" type="button" onClick={() => setActiveView("matches")}>Ver partidos</button>
                </article>
              ) : activeMatch ? (
                <form className="delegate-lineup-form" onSubmit={(event) => submitMatchRoster(event, activeMatch)}>
                  <article className="delegate-match-detail">
                    <span className={`portal-status-pill ${activeMatchStatus.tone}`}>{activeMatchStatus.label}</span>
                    <strong>{context.teamName} vs {activeMatch.opponentName}</strong>
                    <small>{formatMatchDate(activeMatch)} | {activeMatch.venue || "Cancha por definir"}</small>
                  </article>
                  <div className="delegate-lineup-summary">
                    <span><b>{activeDraft.starters?.length || 0}</b> Titulares</span>
                    <span><b>{activeDraft.substitutes?.length || 0}</b> Suplentes</span>
                    <span><b>{activeDraft.playerIds?.length || 0}</b> Convocados</span>
                  </div>
                  <label>Capitan
                    <select
                      value={activeDraft.captainPlayerId}
                      onChange={(event) => updateRosterDraft(activeMatch.id, (current) => ({ ...current, captainPlayerId: event.target.value }))}
                    >
                      <option value="">Selecciona capitan</option>
                      {activeAvailablePlayers.filter((player) => activeDraft.playerIds.includes(player.id)).map((player) => (
                        <option key={player.id} value={player.id}>#{player.number || "-"} {player.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>Portero
                    <select
                      value={activeDraft.goalkeeperPlayerId || ""}
                      onChange={(event) => updateRosterDraft(activeMatch.id, (current) => ({ ...current, goalkeeperPlayerId: event.target.value }))}
                    >
                      <option value="">Selecciona portero</option>
                      {activeAvailablePlayers.filter((player) => activeDraft.playerIds.includes(player.id)).map((player) => (
                        <option key={player.id} value={player.id}>#{player.number || "-"} {player.name}</option>
                      ))}
                    </select>
                  </label>
                  <div className="team-match-player-grid delegate-player-select">
                    {eligiblePlayers.map((player) => {
                      const blockedBySuspension = Boolean(player.suspension);
                      const blockedByPlayoff = activeMatch.isPlayoff && player.playoffEligibility?.applies && !player.playoffEligibility?.eligible;
                      const disabled = blockedBySuspension || blockedByPlayoff;
                      const checked = activeDraft.playerIds.includes(player.id) && !disabled;
                      const rosterRole = activeDraft.starters?.includes(player.id) ? "starter" : activeDraft.substitutes?.includes(player.id) ? "substitute" : "starter";
                      const suspensionLabel = player.suspension?.pendingReview
                        ? `Expulsado sujeto a comision: ${player.suspension.reason || "Revision disciplinaria"}`
                        : player.suspension?.indefinite
                        ? `Inhabilitado indefinido: ${player.suspension.reason || player.suspension.type || "Sancion activa"}`
                        : `Suspendido${player.suspension?.remainingMatches ? ` (${player.suspension.remainingMatches} juego(s))` : ""}${player.suspension?.returnRound ? ` | Regresa J${player.suspension.returnRound}` : ""}`;
                      return (
                        <label className={disabled ? "blocked" : ""} key={player.id}>
                          <input
                            checked={checked}
                            disabled={disabled}
                            type="checkbox"
                            onChange={(event) => updateRosterDraft(activeMatch.id, (current) => {
                              const nextIds = new Set(current.playerIds || []);
                              if (event.target.checked) nextIds.add(player.id);
                              else nextIds.delete(player.id);
                              const playerIds = [...nextIds];
                              return {
                                ...current,
                                playerIds,
                                starters: event.target.checked
                                  ? [...new Set([...(current.starters || []), player.id])]
                                  : (current.starters || []).filter((playerId) => playerId !== player.id),
                                substitutes: (current.substitutes || []).filter((playerId) => playerId !== player.id),
                                captainPlayerId: playerIds.includes(current.captainPlayerId) ? current.captainPlayerId : "",
                                goalkeeperPlayerId: playerIds.includes(current.goalkeeperPlayerId) ? current.goalkeeperPlayerId : ""
                              };
                            })}
                          />
                          <span>
                            <strong>#{player.number || "-"} {player.name}</strong>
                            <small>{disabled ? suspensionLabel : player.position || "Jugador"}</small>
                          </span>
                          {checked && (
                            <select
                              aria-label={`Rol de ${player.name}`}
                              value={rosterRole}
                              onChange={(event) => updateRosterDraft(activeMatch.id, (current) => {
                                const starters = new Set(current.starters || []);
                                const substitutes = new Set(current.substitutes || []);
                                starters.delete(player.id);
                                substitutes.delete(player.id);
                                if (event.target.value === "substitute") substitutes.add(player.id);
                                else starters.add(player.id);
                                return {
                                  ...current,
                                  starters: [...starters].filter((playerId) => current.playerIds.includes(playerId)),
                                  substitutes: [...substitutes].filter((playerId) => current.playerIds.includes(playerId))
                                };
                              })}
                            >
                              <option value="starter">Titular</option>
                              <option value="substitute">Suplente</option>
                            </select>
                          )}
                        </label>
                      );
                    })}
                  </div>
                  <label className="wide-field">Notas para el arbitro
                    <input
                      value={activeDraft.notes || ""}
                      onChange={(event) => updateRosterDraft(activeMatch.id, (current) => ({ ...current, notes: event.target.value }))}
                      placeholder="Ej. Capitan alterno, uniforme, observaciones"
                    />
                  </label>
                  <button className="portal-primary-action" type="submit" disabled={busyMatchId === activeMatch.id}>
                    {busyMatchId === activeMatch.id ? "Enviando..." : activeMatch.roster ? "Actualizar convocatoria" : "Enviar convocatoria"}
                  </button>
                </form>
              ) : (
                <p className="empty">Selecciona un partido para preparar convocatoria.</p>
              )}
            </div>
          )}

          {activeView === "roster" && (
            <div className="delegate-view-stack">
              <section className="delegate-roster-hero">
                <div>
                  <span>Plantilla del equipo</span>
                  <strong>{players.length} jugador(es) registrados</strong>
                  <small>Registro abierto sin limite de integrantes.</small>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditingPlayerId("");
                    setActiveView("newPlayer");
                  }}
                  disabled={!context.canManageRoster}
                >
                  Nuevo jugador
                </button>
              </section>
              <div className="delegate-roster-metrics">
                <span><b>{players.length}</b> Total</span>
                {positionCounts.map((item) => (
                  <span key={item.position}><b>{item.count}</b> {item.position}</span>
                ))}
              </div>
              <div className="team-portal-filters delegate-roster-tools">
                <label className="delegate-search-field">Buscar jugador
                  <input
                    value={playerQuery}
                    onChange={(event) => setPlayerQuery(event.target.value)}
                    placeholder="Nombre o numero"
                  />
                </label>
                <div className="delegate-position-tabs" role="group" aria-label="Filtrar por posicion">
                  <button className={!positionFilter ? "active" : ""} type="button" onClick={() => setPositionFilter("")}>Todas</button>
                  {PLAYER_POSITION_OPTIONS.map((position) => (
                    <button className={positionFilter === position ? "active" : ""} key={position} type="button" onClick={() => setPositionFilter(position)}>
                      {position}
                    </button>
                  ))}
                </div>
              </div>
              <div className="team-portal-player-list delegate-roster-list">
                {filteredPlayers.map((player) => {
                  const isEditing = editingPlayerId === player.id;
                  return (
                    <article className={isEditing ? "editing" : ""} key={player.id}>
                      <span className="player-avatar team-portal-avatar">
                        {player.photoAuthorized && player.photoUrl ? <img alt="" loading="lazy" src={player.photoUrl} /> : null}
                        <span>{getPlayerPhotoInitials(player.name)}</span>
                      </span>
                      <div>
                        <strong>{player.name}</strong>
                        <small><b>#{player.number || "-"}</b> {getPlayerPositionOptionValue(player.position)}</small>
                        <PlayoffProgress eligibility={player.playoffEligibility} />
                      </div>
                      <button
                        className="delegate-player-edit-button"
                        type="button"
                        disabled={!context.canManageRoster}
                        onClick={() => {
                          setEditingPlayerId(player.id);
                          setActiveView("player");
                        }}
                      >
                        {context.canManageRoster ? "Editar" : "Cerrado"}
                      </button>
                    </article>
                  );
                })}
                {!players.length && <p className="empty">Aun no hay jugadores registrados en este equipo.</p>}
                {players.length > 0 && !filteredPlayers.length && <p className="empty">No hay jugadores con esos filtros.</p>}
              </div>
            </div>
          )}

          {activeView === "newPlayer" && (
            <div className="delegate-view-stack delegate-player-editor-screen">
              <section className="delegate-player-editor-hero delegate-player-create-hero">
                <span className="player-avatar team-portal-avatar">
                  <span>+</span>
                </span>
                <div>
                  <span>Alta de jugador</span>
                  <strong>Nuevo integrante</strong>
                  <small>Captura datos basicos y foto autorizada</small>
                </div>
              </section>
              <div className="delegate-player-editor-stats">
                <span><small>Plantilla</small><strong>{players.length}</strong></span>
                <span><small>Registro</small><strong>Abierto</strong></span>
                <span><small>Foto</small><strong>Opcional</strong></span>
              </div>
              <form className="delegate-player-edit-form" onSubmit={submitPlayer}>
                <label>Nombre completo
                  <input name="name" required pattern=".*\S+\s+\S+.*" placeholder="Nombre y apellidos" title="Registra nombre(s) y apellido(s)" />
                </label>
                <div className="delegate-player-edit-grid">
                  <label>Numero
                    <input name="number" type="number" min="0" max="9999" placeholder="10" />
                  </label>
                  <label>Posicion
                    <select name="position" defaultValue="Delantero">
                      {PLAYER_POSITION_OPTIONS.map((position) => <option key={position} value={position}>{position}</option>)}
                    </select>
                  </label>
                </div>
                <PlayerPhotoUploader
                  key={photoResetKey}
                  compact
                  addLabel="Subir foto"
                  authorizedLabel="Autorizo subir y usar la foto del jugador"
                  playerName="Nuevo jugador"
                />
                <div className="delegate-player-edit-actions">
                  <button className="portal-primary-action" type="submit">Guardar jugador</button>
                  <button type="button" onClick={() => setActiveView("roster")}>Cancelar</button>
                </div>
              </form>
            </div>
          )}

          {activeView === "player" && (
            <div className="delegate-view-stack delegate-player-editor-screen">
              {selectedEditingPlayer ? (
                <>
                  <section className="delegate-player-editor-hero">
                    <span className="player-avatar team-portal-avatar">
                      {selectedEditingPlayer.photoAuthorized && selectedEditingPlayer.photoUrl ? <img alt="" src={selectedEditingPlayer.photoUrl} /> : null}
                      <span>{getPlayerPhotoInitials(selectedEditingPlayer.name)}</span>
                    </span>
                    <div>
                      <span>Ficha de jugador</span>
                      <strong>{selectedEditingPlayer.name}</strong>
                      <small>#{selectedEditingPlayer.number || "-"} | {getPlayerPositionOptionValue(selectedEditingPlayer.position)}</small>
                    </div>
                  </section>
                  <div className="delegate-player-editor-stats">
                    <span><small>Numero</small><strong>#{selectedEditingPlayer.number || "-"}</strong></span>
                    <span><small>Posicion</small><strong>{getPlayerPositionOptionValue(selectedEditingPlayer.position)}</strong></span>
                    <span><small>Foto</small><strong>{selectedEditingPlayer.photoAuthorized && selectedEditingPlayer.photoUrl ? "Activa" : "Pendiente"}</strong></span>
                  </div>
                  <form className="delegate-player-edit-form" onSubmit={(event) => submitPlayerEdit(event, selectedEditingPlayer)}>
                    <label>Nombre completo
                      <input name="name" required pattern=".*\S+\s+\S+.*" defaultValue={selectedEditingPlayer.name} title="Registra nombre(s) y apellido(s)" />
                    </label>
                    <div className="delegate-player-edit-grid">
                      <label>Numero
                        <input name="number" type="number" min="0" max="9999" defaultValue={selectedEditingPlayer.number || ""} />
                      </label>
                      <label>Posicion
                        <select name="position" defaultValue={getPlayerPositionOptionValue(selectedEditingPlayer.position)}>
                          {PLAYER_POSITION_OPTIONS.map((position) => <option key={position} value={position}>{position}</option>)}
                        </select>
                      </label>
                    </div>
                    <PlayerPhotoUploader compact defaultAuthorized={selectedEditingPlayer.photoAuthorized === true} existingPhotoUrl={selectedEditingPlayer.photoUrl || ""} playerName={selectedEditingPlayer.name} />
                    <div className="delegate-player-edit-actions">
                      <button className="portal-primary-action" type="submit" disabled={busyPlayerId === selectedEditingPlayer.id}>
                        {busyPlayerId === selectedEditingPlayer.id ? "Guardando..." : "Guardar cambios"}
                      </button>
                      <button type="button" onClick={() => {
                        setEditingPlayerId("");
                        setActiveView("roster");
                      }}>
                        Cancelar
                      </button>
                    </div>
                  </form>
                </>
              ) : (
                <article className="delegate-match-detail">
                  <span className="portal-status-pill neutral">Jugador no disponible</span>
                  <strong>No encontramos esta ficha.</strong>
                  <button className="portal-primary-action" type="button" onClick={() => setActiveView("roster")}>Volver a plantilla</button>
                </article>
              )}
            </div>
          )}

          {activeView === "tools" && (
            <div className="delegate-view-stack">
              <article className="delegate-match-detail">
                <span className="portal-status-pill neutral">Herramientas</span>
                <strong>Gestion del equipo</strong>
                <small>El PIN y la firma digital solo aparecen dentro del seguimiento del acta.</small>
                {activeMatch?.roster && (
                  <button className="portal-primary-action" type="button" onClick={() => setActiveView("acta")}>
                    Ir al seguimiento del acta
                  </button>
                )}
              </article>
              <form className="team-logo-form" onSubmit={submitTeamLogo}>
                <SectionHeading eyebrow="Equipo" title="Escudo del equipo" />
                <PlayerPhotoUploader
                  key={teamLogoResetKey}
                  addLabel="Agregar escudo"
                  authorizedLabel="Escudo autorizado"
                  changeLabel="Cambiar escudo"
                  defaultAuthorized={Boolean(context.teamLogoUrl)}
                  existingPhotoUrl={context.teamLogoUrl || ""}
                  playerName={context.teamName}
                  removeLabel="Quitar escudo"
                />
                <button className="primary" type="submit">Guardar escudo</button>
              </form>
            </div>
          )}
        </section>
      </div>
      {!isExclusiveView && <nav className="portal-bottom-nav" aria-label="Navegacion delegado">
        {navItems.map((item) => (
          <button className={activeView === item.id ? "active" : ""} key={item.id} type="button" onClick={() => setActiveView(item.id)}>
            <PortalNavIcon type={item.icon} /><span>{item.label}</span>
          </button>
        ))}
      </nav>}
    </main>
  );
}

function PlayoffProgress({ eligibility }) {
  if (!eligibility?.applies) return null;
  const label = eligibility.eligible
    ? "Disponible para liguilla"
    : `Faltan ${eligibility.remaining} partido(s)`;

  return (
    <span className={`team-player-progress ${eligibility.eligible ? "complete" : ""}`}>
      <span>
        Liguilla: {eligibility.recognizedAppearances}/{eligibility.required} | {label}
      </span>
      <span className="team-player-progress-track" aria-hidden="true">
        <span style={{ width: `${Math.max(0, Math.min(100, eligibility.percentage || 0))}%` }} />
      </span>
    </span>
  );
}

function buildRosterDrafts(matches, eligiblePlayers) {
  const drafts = {};
  for (const match of matches || []) {
    const availablePlayerIds = eligiblePlayers
      .filter((player) => {
        const blockedBySuspension = Boolean(player.suspension);
        const blockedByPlayoff = match.isPlayoff && player.playoffEligibility?.applies && !player.playoffEligibility?.eligible;
        return !blockedBySuspension && !blockedByPlayoff;
      })
      .map((player) => player.id);
    const rosterPlayerIds = (match.roster?.players || [])
      .map((entry) => typeof entry === "string" ? entry : entry.playerId)
      .filter((playerId) => availablePlayerIds.includes(playerId));
    const playerIds = rosterPlayerIds.length ? rosterPlayerIds : availablePlayerIds;
    const starters = (match.roster?.starters?.length ? match.roster.starters : playerIds.slice(0, 11))
      .filter((playerId) => playerIds.includes(playerId));
    const substitutes = (match.roster?.substitutes?.length ? match.roster.substitutes : playerIds.slice(11))
      .filter((playerId) => playerIds.includes(playerId) && !starters.includes(playerId));
    const captainPlayerId = playerIds.includes(match.roster?.captainPlayerId)
      ? match.roster.captainPlayerId
      : playerIds[0] || "";
    const goalkeeperPlayerId = playerIds.includes(match.roster?.goalkeeperPlayerId)
      ? match.roster.goalkeeperPlayerId
      : playerIds.find((playerId) => {
        const player = eligiblePlayers.find((item) => item.id === playerId);
        return getPlayerPositionOptionValue(player?.position) === "Arquero";
      }) || playerIds[0] || "";
    drafts[match.id] = {
      playerIds,
      starters,
      substitutes,
      captainPlayerId,
      goalkeeperPlayerId,
      notes: match.roster?.notes || ""
    };
  }
  return drafts;
}

function getEligiblePlayerName(players, playerId) {
  return players.find((player) => player.id === playerId)?.name || "Sin capitan";
}

async function buildImageUploadPayload(payload, fallbackPhotoUrl, authToken, leagueId, scope) {
  const photoAuthorized = payload.photoAuthorized === true || payload.photoAuthorized === "true" || payload.photoAuthorized === "on";
  const shouldRemovePhoto = payload.removePhoto === "on";
  const photoUrl = shouldRemovePhoto
    ? ""
    : !photoAuthorized
      ? ""
      : payload.photoDataUrl
        ? (await uploadImage(authToken, {
          dataUrl: payload.photoDataUrl,
          leagueId,
          scope
        })).url
        : fallbackPhotoUrl;

  return { photoAuthorized, photoUrl };
}

function normalizeSearch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleUpperCase("es-MX");
}

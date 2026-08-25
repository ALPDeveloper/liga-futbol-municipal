import { useEffect, useMemo, useState } from "react";
import { getCompetition, getDefaultCompetitionId } from "../lib/domain.js";
import { submitAccessRequest } from "../lib/accessRequestApi.js";
import { getFormPayload } from "./forms.js";
import { PasswordField } from "./PasswordField.jsx";

function normalizeSearchTerm(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-MX")
    .trim();
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

function AccessTeamMark({ team, className = "" }) {
  const label = team?.name || "Equipo";
  const canShowLogo = Boolean(team?.logoUrl);

  return (
    <span
      aria-hidden="true"
      className={`team-mark ${canShowLogo ? "has-image" : ""} ${className}`}
      style={{ background: team?.colors || "var(--field)" }}
      title={label}
    >
      <span>{getTeamInitials(label)}</span>
      {canShowLogo && <img alt="" loading="eager" src={team.logoUrl} />}
    </span>
  );
}

export function PublicAccessRequestSheet({ league, onClose }) {
  const [role, setRole] = useState("team_delegate");
  const [competitionFilter, setCompetitionFilter] = useState("all");
  const [teamSearch, setTeamSearch] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);
  const teams = useMemo(
    () => [...(league?.teams || [])]
      .filter((team) => !["deleted", "withdrawn"].includes(team.status))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [league?.teams]
  );
  const competitions = useMemo(
    () => [...(league?.competitions || [])]
      .filter((competition) => !["archived", "hidden"].includes(competition.status))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [league?.competitions]
  );
  const filteredTeams = useMemo(() => {
    const query = normalizeSearchTerm(teamSearch);
    return teams.filter((team) => {
      const competitionId = team.competitionId || getDefaultCompetitionId(league);
      if (competitionFilter !== "all" && competitionId !== competitionFilter) return false;
      if (!query) return true;
      const competition = getCompetition(league, competitionId);
      return normalizeSearchTerm(`${team.name} ${team.shortName || ""} ${competition?.name || ""}`).includes(query);
    });
  }, [competitionFilter, league, teamSearch, teams]);
  const groupedTeams = useMemo(() => {
    const groups = new Map();
    filteredTeams.forEach((team) => {
      const competition = getCompetition(league, team.competitionId || getDefaultCompetitionId(league));
      const key = competition?.id || "general";
      if (!groups.has(key)) groups.set(key, { id: key, title: competition?.name || "Sin categoria", teams: [] });
      groups.get(key).teams.push(team);
    });
    return [...groups.values()];
  }, [filteredTeams, league]);
  const selectedTeam = teams.find((team) => team.id === selectedTeamId);

  useEffect(() => {
    if (role !== "team_delegate") return;
    if (selectedTeamId && filteredTeams.some((team) => team.id === selectedTeamId)) return;
    setSelectedTeamId(filteredTeams[0]?.id || "");
  }, [filteredTeams, role, selectedTeamId]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
    const { body, documentElement } = document;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyPosition = body.style.position;
    const previousBodyTop = body.style.top;
    const previousBodyWidth = body.style.width;
    const previousHtmlOverflow = documentElement.style.overflow;

    documentElement.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";

    return () => {
      documentElement.style.overflow = previousHtmlOverflow;
      body.style.overflow = previousBodyOverflow;
      body.style.position = previousBodyPosition;
      body.style.top = previousBodyTop;
      body.style.width = previousBodyWidth;
      window.scrollTo(0, scrollY);
    };
  }, []);

  async function submitRequest(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = getFormPayload(form);
    if (role === "team_delegate" && !selectedTeamId) {
      setError("Selecciona el equipo al que quieres solicitar acceso.");
      return;
    }
    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      const response = await submitAccessRequest({
        leagueId: league.id,
        role,
        teamId: role === "team_delegate" ? selectedTeamId : "",
        name: payload.name,
        phone: payload.phone,
        email: payload.email,
        password: payload.password,
        confirmPassword: payload.confirmPassword
      });
      setNotice(response.message || "Solicitud enviada. Espera la aprobacion del administrador.");
      form.reset();
      setTeamSearch("");
    } catch (requestError) {
      setError(requestError.message || "No se pudo enviar la solicitud.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!league) return null;

  return (
    <div className="public-access-request-backdrop" role="presentation" onClick={onClose}>
      <section
        aria-label="Solicitar acceso"
        aria-modal="true"
        className="public-access-request-sheet"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="public-access-request-head">
          <div>
            <span>Acceso a {league.name}</span>
            <strong>Solicitar cuenta</strong>
            <small>Si ya tienes cuenta, usa tu mismo correo y contraseña actual para pedir otro acceso.</small>
          </div>
          <button type="button" aria-label="Cerrar solicitud" onClick={onClose}>X</button>
        </div>

        <form className="public-access-request-form" onSubmit={submitRequest}>
          <div className="public-access-role-tabs" aria-label="Tipo de acceso">
            <button className={role === "team_delegate" ? "active" : ""} type="button" onClick={() => setRole("team_delegate")}>Delegado</button>
            <button className={role === "referee" ? "active" : ""} type="button" onClick={() => setRole("referee")}>Arbitro</button>
          </div>

          {role === "team_delegate" && (
            <section className="public-access-team-picker">
              <div className="public-access-guide">
                <strong>Selecciona tu equipo</strong>
                <span>Solo aparecen equipos registrados en esta liga.</span>
              </div>
              <label>Torneo o categoria
                <select value={competitionFilter} onChange={(event) => setCompetitionFilter(event.target.value)}>
                  <option value="all">Todas las categorias</option>
                  {competitions.map((competition) => (
                    <option key={competition.id} value={competition.id}>{competition.name}</option>
                  ))}
                </select>
              </label>
              <label className="public-access-search-field">Buscar equipo
                <input
                  value={teamSearch}
                  onChange={(event) => setTeamSearch(event.target.value)}
                  placeholder="Ej. Chucandiran, Vasco, Mercado..."
                />
                {teamSearch && <button type="button" onClick={() => setTeamSearch("")}>X</button>}
              </label>
              <div className="public-access-team-list">
                {groupedTeams.map((group) => (
                  <div key={group.id}>
                    <small>{group.title}</small>
                    {group.teams.slice(0, 10).map((team) => (
                      <button
                        className={selectedTeamId === team.id ? "active" : ""}
                        key={team.id}
                        type="button"
                        onClick={() => {
                          setSelectedTeamId(team.id);
                          setTeamSearch(team.name);
                        }}
                      >
                        <AccessTeamMark team={team} className="public-access-team-mark" />
                        <span>{team.name}</span>
                      </button>
                    ))}
                  </div>
                ))}
                {!filteredTeams.length && <p>Sin equipos para esa busqueda.</p>}
              </div>
              {selectedTeam && <p className="public-access-selected-team">Equipo seleccionado: <strong>{selectedTeam.name}</strong></p>}
            </section>
          )}

          {role === "referee" && (
            <section className="public-access-guide referee">
              <strong>Solicitud de arbitro</strong>
              <span>El administrador de {league.name} revisara tu registro antes de habilitar designaciones.</span>
            </section>
          )}

          <div className="public-access-fields">
            <label>Nombre completo<input name="name" required placeholder="Nombre y apellidos" /></label>
            <label>Telefono<input name="phone" required inputMode="tel" placeholder="Telefono de contacto" /></label>
            <label>Correo electronico<input name="email" required type="email" placeholder="correo@ejemplo.com" /></label>
            <PasswordField
              autoComplete="current-password"
              label="Contraseña"
              name="password"
              placeholder="Nueva o actual si ya tienes cuenta"
              visible={showPasswords}
              onToggleVisibility={() => setShowPasswords((value) => !value)}
            />
            <PasswordField
              autoComplete="current-password"
              label="Confirmar contraseña"
              name="confirmPassword"
              placeholder="Repite la contraseña"
              visible={showPasswords}
              onToggleVisibility={() => setShowPasswords((value) => !value)}
            />
          </div>

          {notice && <p className="auth-ok">{notice}</p>}
          {error && <p className="auth-error">{error}</p>}

          <div className="public-access-actions">
            <button className="secondary" type="button" onClick={onClose}>Cancelar</button>
            <button className="primary" type="submit" disabled={submitting}>{submitting ? "Enviando..." : "Enviar solicitud"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

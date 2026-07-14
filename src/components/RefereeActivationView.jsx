import { useEffect, useState } from "react";
import alpLogo from "../../assets/alp-logo.png";
import ligatecLogo from "../../assets/ligatec-logo.png";
import { activateReferee, fetchRefereeActivation } from "../lib/refereeActivationApi.js";

export function RefereeActivationView({ token, onActivated, onNavigate }) {
  const [activation, setActivation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchRefereeActivation(token)
      .then((payload) => {
        if (!cancelled) {
          setActivation(payload);
          setError("");
        }
      })
      .catch((activationError) => {
        if (!cancelled) setError(activationError.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");
    setError("");
    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") || "");
    const confirmPassword = String(formData.get("confirmPassword") || "");
    try {
      const payload = await activateReferee(token, { password, confirmPassword });
      setMessage(payload.message || "Cuenta activada correctamente.");
      onActivated({ token: payload.token, user: payload.user });
    } catch (submitError) {
      setError(submitError.message);
    }
  }

  return (
    <main className="page activation-page auth-experience-page">
      <div className="access-hero-head">
        <div className="access-brand-lockup">
          <span className="brand-mark brand-mark-logo access-logo"><img alt="" src={ligatecLogo} /></span>
          <span>
            <strong className="brand-wordmark">LIGA<span>TEC</span></strong>
            <small>PLATAFORMA DEPORTIVA</small>
          </span>
        </div>
      </div>
      <section className="activation-card">
        <span className="auth-pill"><span className="access-lock-icon" />Activacion de arbitro</span>
        <h1>Crear cuenta</h1>
        <p className="activation-intro">Configura tu contraseña para entrar al panel de árbitro y capturar tus partidos asignados.</p>
        {loading ? (
          <p className="helper-text">Validando invitacion...</p>
        ) : error && !activation ? (
          <>
            <p className="sheet-alert">{error}</p>
            <p className="helper-text">Solicita una nueva invitacion al administrador de la liga.</p>
            <button type="button" onClick={() => onNavigate("/")}>Volver al inicio</button>
          </>
        ) : (
          <>
            <div className="activation-summary">
              <span>Arbitro</span>
              <strong>{activation?.refereeName}</strong>
              <span>Municipio</span>
              <strong>{activation?.municipality}</strong>
            </div>
            <form className="form-grid activation-form" onSubmit={handleSubmit}>
              <label>Contraseña
                <input name="password" type="password" required minLength={10} autoComplete="new-password" />
              </label>
              <label>Confirmar contraseña
                <input name="confirmPassword" type="password" required minLength={10} autoComplete="new-password" />
              </label>
              <p className="helper-text">Usa mayusculas, minusculas y numeros. Esta cuenta solo vera partidos asignados como arbitro central.</p>
              {error && <p className="sheet-alert">{error}</p>}
              {message && <p className="auth-ok">{message}</p>}
              <button className="primary" type="submit">Activar cuenta</button>
            </form>
          </>
        )}
      </section>
      <footer className="access-footer">
        <strong>La evolucion digital del futbol amateur.</strong>
        <span className="access-footer-dev">
          <small>Desarrollado por</small>
          <img alt="ALP DEV" src={alpLogo} />
        </span>
      </footer>
    </main>
  );
}

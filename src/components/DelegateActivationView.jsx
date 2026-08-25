import { useEffect, useState } from "react";
import alpLogo from "../../assets/alp-logo.png";
import ligatecLogo from "../../assets/ligatec-logo.png";
import { activateDelegate, fetchDelegateActivation } from "../lib/delegateActivationApi.js";
import { PasswordField } from "./PasswordField.jsx";

export function DelegateActivationView({ token, onActivated, onNavigate }) {
  const [activation, setActivation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchDelegateActivation(token)
      .then((payload) => {
        if (cancelled) return;
        setActivation(payload);
        setError("");
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError.message || "Invitacion no disponible.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function submitActivation(event) {
    event.preventDefault();
    setError("");
    setNotice("Activando cuenta...");
    try {
      const payload = await activateDelegate(token, { password, confirmPassword });
      setNotice(payload.message || "Cuenta activada correctamente.");
      onActivated({ token: payload.token, user: payload.user });
    } catch (activationError) {
      setNotice("");
      setError(activationError.message || "No se pudo activar la cuenta.");
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
        <span className="auth-pill"><span className="access-lock-icon" />Activacion de delegado</span>
        <h1>Activa tu cuenta</h1>
        <p className="activation-intro">Crea tu contraseña para administrar la plantilla de tu equipo en LIGATEC.</p>
        {loading ? (
          <p className="helper-text">Validando invitacion...</p>
        ) : error && !activation ? (
          <>
            <p className="auth-error">{error}</p>
            <p className="helper-text">Solicita una nueva invitacion al administrador de la liga.</p>
            <button type="button" onClick={() => onNavigate("/")}>Ir a LIGATEC</button>
          </>
        ) : (
          <>
            <div className="activation-summary">
              <span>Delegado</span>
              <strong>{activation.delegateName}</strong>
              <span>Equipo</span>
              <strong>{activation.teamName}</strong>
              <span>Liga</span>
              <strong>{activation.leagueName}</strong>
            </div>
            <form className="activation-form" onSubmit={submitActivation}>
              <PasswordField
                autoComplete="new-password"
                label="Contraseña"
                minLength={10}
                name="password"
                placeholder="Minimo 10 caracteres"
                value={password}
                visible={showPasswords}
                onChange={(event) => setPassword(event.target.value)}
                onToggleVisibility={() => setShowPasswords((value) => !value)}
              />
              <PasswordField
                autoComplete="new-password"
                label="Confirmar contraseña"
                minLength={10}
                name="confirmPassword"
                placeholder="Repite tu contraseña"
                value={confirmPassword}
                visible={showPasswords}
                onChange={(event) => setConfirmPassword(event.target.value)}
                onToggleVisibility={() => setShowPasswords((value) => !value)}
              />
              <button className="primary" type="submit">Activar cuenta</button>
            </form>
            <p className="helper-text">Usa mayusculas, minusculas y numeros. Esta cuenta solo administrara la plantilla de tu equipo.</p>
            {notice && <p className="auth-ok">{notice}</p>}
            {error && <p className="auth-error">{error}</p>}
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

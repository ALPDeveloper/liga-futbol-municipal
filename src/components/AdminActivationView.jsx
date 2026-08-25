import { useEffect, useState } from "react";
import alpLogo from "../../assets/alp-logo.png";
import ligatecLogo from "../../assets/ligatec-logo.png";
import { activateAdmin, fetchAdminActivation } from "../lib/adminActivationApi.js";
import { PasswordField } from "./PasswordField.jsx";

function getRoleLabel(role) {
  if (role === "super_admin") return "Super administrador";
  if (role === "league_admin") return "Administrador de liga";
  return "Administrador con permisos limitados";
}

export function AdminActivationView({ token, onActivated, onNavigate }) {
  const [activation, setActivation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchAdminActivation(token)
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
    try {
      const payload = await activateAdmin(token, {
        password: String(formData.get("password") || ""),
        confirmPassword: String(formData.get("confirmPassword") || "")
      });
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
        <span className="auth-pill"><span className="access-lock-icon" />Activacion administrativa</span>
        <h1>Crear contraseña</h1>
        <p className="activation-intro">Activa tu acceso privado para administrar la liga desde LIGATEC.</p>
        {loading ? (
          <p className="helper-text">Validando invitacion...</p>
        ) : error && !activation ? (
          <>
            <p className="sheet-alert">{error}</p>
            <p className="helper-text">Solicita una nueva invitacion al super administrador.</p>
            <button type="button" onClick={() => onNavigate("/")}>Volver al inicio</button>
          </>
        ) : (
          <>
            <div className="activation-summary">
              <span>Usuario</span>
              <strong>{activation?.adminName}</strong>
              <span>Acceso</span>
              <strong>{getRoleLabel(activation?.role)}</strong>
              <span>Liga</span>
              <strong>{activation?.leagueName || "Todas las ligas"}</strong>
            </div>
            <form className="form-grid activation-form" onSubmit={handleSubmit}>
              <PasswordField
                autoComplete="new-password"
                label="Contraseña"
                minLength={10}
                name="password"
                visible={showPasswords}
                onToggleVisibility={() => setShowPasswords((value) => !value)}
              />
              <PasswordField
                autoComplete="new-password"
                label="Confirmar contraseña"
                minLength={10}
                name="confirmPassword"
                visible={showPasswords}
                onToggleVisibility={() => setShowPasswords((value) => !value)}
              />
              <p className="helper-text">Usa mayusculas, minusculas y numeros. Despues entraras desde Acceso LIGATEC.</p>
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

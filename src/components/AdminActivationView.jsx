import { useEffect, useState } from "react";
import { activateAdmin, fetchAdminActivation } from "../lib/adminActivationApi.js";

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
    <main className="page activation-page">
      <section className="activation-card">
        <span className="eyebrow">Activacion administrativa</span>
        <h1>Crear contraseña</h1>
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
              <label>Contraseña
                <input name="password" type="password" required minLength={10} autoComplete="new-password" />
              </label>
              <label>Confirmar contraseña
                <input name="confirmPassword" type="password" required minLength={10} autoComplete="new-password" />
              </label>
              <p className="helper-text">Usa mayusculas, minusculas y numeros. Despues entraras desde Acceso LIGATEC.</p>
              {error && <p className="sheet-alert">{error}</p>}
              {message && <p className="auth-ok">{message}</p>}
              <button className="primary" type="submit">Activar cuenta</button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}

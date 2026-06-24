import { useEffect, useState } from "react";
import { activateDelegate, fetchDelegateActivation } from "../lib/delegateActivationApi.js";

export function DelegateActivationView({ token, onActivated, onNavigate }) {
  const [activation, setActivation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

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
    <main className="page activation-page">
      <section className="activation-card">
        <span className="eyebrow">Activacion de delegado</span>
        <h1>Activa tu cuenta</h1>
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
              <label>Contraseña
                <input
                  autoComplete="new-password"
                  minLength="10"
                  required
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Minimo 10 caracteres"
                />
              </label>
              <label>Confirmar contraseña
                <input
                  autoComplete="new-password"
                  minLength="10"
                  required
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Repite tu contraseña"
                />
              </label>
              <button className="primary" type="submit">Activar cuenta</button>
            </form>
            <p className="helper-text">Usa mayusculas, minusculas y numeros. Esta cuenta solo administrara la plantilla de tu equipo.</p>
            {notice && <p className="auth-ok">{notice}</p>}
            {error && <p className="auth-error">{error}</p>}
          </>
        )}
      </section>
    </main>
  );
}

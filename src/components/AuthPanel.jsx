import { useState } from "react";
import { requestPasswordReset, resetPassword } from "../lib/userApi.js";

function AuthIcon({ name }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    strokeWidth: 2,
    viewBox: "0 0 24 24",
    "aria-hidden": "true"
  };
  if (name === "mail") {
    return (
      <svg {...common}>
        <rect width="20" height="16" x="2" y="4" rx="2" />
        <path d="m22 7-10 6L2 7" />
      </svg>
    );
  }
  if (name === "eye") {
    return (
      <svg {...common}>
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }
  if (name === "arrow") {
    return (
      <svg {...common}>
        <path d="M5 12h14" />
        <path d="m13 6 6 6-6 6" />
      </svg>
    );
  }
  if (name === "code") {
    return (
      <svg {...common}>
        <path d="M7 8h10" />
        <path d="M7 12h10" />
        <path d="M7 16h6" />
      </svg>
    );
  }
  if (name === "user") {
    return (
      <svg {...common}>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect width="18" height="12" x="3" y="10" rx="2" />
      <path d="M7 10V7a5 5 0 0 1 10 0v3" />
    </svg>
  );
}

export function AuthPanel({ currentUser, onLogin, onLogout }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [mode, setMode] = useState("login");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [recoveryMessage, setRecoveryMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [rememberSession, setRememberSession] = useState(true);

  if (currentUser) {
    return (
      <div className="auth-panel signed-in">
        <span className="auth-field-icon"><AuthIcon name="user" /></span>
        <span>
          <strong>{currentUser.name}</strong>
          <small>{currentUser.role === "super_admin" ? "Super admin" : currentUser.role === "team_delegate" ? "Delegado de equipo" : currentUser.role === "referee" ? "Arbitro" : currentUser.role === "admin_limited" ? "Admin limitado" : "Admin de liga"}</small>
        </span>
        <button type="button" onClick={onLogout}>Salir</button>
      </div>
    );
  }

  if (mode === "recover") {
    return (
      <form
        className="auth-panel recovery"
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          setRecoveryMessage("");
          try {
            const response = recoveryCode
              ? await resetPassword({ email, code: recoveryCode, password: newPassword })
              : await requestPasswordReset(email);
            setRecoveryMessage(response.recoveryCode ? `${response.message} Codigo: ${response.recoveryCode}` : response.message);
            if (recoveryCode) {
              setPassword("");
              setMode("login");
            }
          } catch (requestError) {
            setError(requestError.message);
          }
        }}
      >
        <small className="auth-help">Solicita tu codigo con el correo registrado y despues crea una contraseña nueva.</small>
        <label className="auth-field">
          <span>Correo electronico</span>
          <span className="auth-input-shell">
            <AuthIcon name="mail" />
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="nombre@correo.com" aria-label="Correo de recuperacion" />
          </span>
        </label>
        <label className="auth-field">
          <span>Codigo de recuperacion</span>
          <span className="auth-input-shell">
            <AuthIcon name="code" />
            <input value={recoveryCode} onChange={(event) => setRecoveryCode(event.target.value)} placeholder="Codigo" aria-label="Codigo de recuperacion" />
          </span>
        </label>
        <label className="auth-field">
          <span>Nueva contraseña</span>
          <span className="auth-input-shell">
            <AuthIcon name="lock" />
            <input value={newPassword} onChange={(event) => setNewPassword(event.target.value)} type={showNewPassword ? "text" : "password"} placeholder="Minimo 10 caracteres" aria-label="Nueva contraseña" />
            <button className="auth-visibility-button" type="button" onClick={() => setShowNewPassword((value) => !value)} aria-label={showNewPassword ? "Ocultar contraseña" : "Mostrar contraseña"}>
              <AuthIcon name="eye" />
            </button>
          </span>
        </label>
        <button className="primary auth-submit-button" type="submit">
          <span>{recoveryCode ? "Cambiar contraseña" : "Pedir codigo"}</span>
          <AuthIcon name="arrow" />
        </button>
        <button className="auth-secondary-action" type="button" onClick={() => setMode("login")}>Volver al inicio de sesion</button>
        {recoveryMessage && <small className="auth-ok">{recoveryMessage}</small>}
        {error && <small className="auth-error">{error}</small>}
      </form>
    );
  }

  return (
    <form
      className="auth-panel"
      onSubmit={async (event) => {
        event.preventDefault();
        setError("");
        try {
          await onLogin(email, password, rememberSession);
        } catch (loginError) {
          setError(loginError.message);
        }
      }}
    >
      <label className="auth-field">
        <span>Correo electronico</span>
        <span className="auth-input-shell">
          <AuthIcon name="mail" />
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="nombre@correo.com" aria-label="Correo" autoComplete="email" />
        </span>
      </label>
      <label className="auth-field">
        <span>Contraseña</span>
        <span className="auth-input-shell">
          <AuthIcon name="lock" />
          <input value={password} onChange={(event) => setPassword(event.target.value)} type={showPassword ? "text" : "password"} placeholder="Ingresa tu contraseña" aria-label="Contraseña" autoComplete="current-password" />
          <button className="auth-visibility-button" type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}>
            <AuthIcon name="eye" />
          </button>
        </span>
      </label>
      <div className="auth-inline-actions">
        <label className="auth-remember">
          <input type="checkbox" checked={rememberSession} onChange={(event) => setRememberSession(event.target.checked)} aria-label="Mantener mi sesion iniciada" />
          <span>Mantener mi sesion iniciada</span>
        </label>
        <button className="auth-link-action" type="button" onClick={() => setMode("recover")}>Olvidaste tu contraseña?</button>
      </div>
      <button className="primary auth-submit-button" type="submit">
        <span>Iniciar sesion</span>
        <AuthIcon name="arrow" />
      </button>
      {error && <small className="auth-error">{error}</small>}
    </form>
  );
}

import { useState } from "react";
import { requestPasswordReset, resetPassword } from "../lib/userApi.js";

export function AuthPanel({ currentUser, onLogin, onLogout }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [mode, setMode] = useState("login");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [recoveryMessage, setRecoveryMessage] = useState("");

  if (currentUser) {
    return (
      <div className="auth-panel signed-in">
        <span>
          <strong>{currentUser.name}</strong>
          <small>{currentUser.role === "super_admin" ? "Super admin" : currentUser.role === "team_delegate" ? "Delegado de equipo" : currentUser.role === "referee" ? "Arbitro" : "Admin de liga"}</small>
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
        <small className="auth-help">Solicita el codigo con tu correo. Si existe una cuenta activa, recibiras instrucciones por el canal configurado.</small>
        <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="Correo" aria-label="Correo de recuperacion" />
        <input value={recoveryCode} onChange={(event) => setRecoveryCode(event.target.value)} placeholder="Codigo" aria-label="Codigo de recuperacion" />
        <input value={newPassword} onChange={(event) => setNewPassword(event.target.value)} type="password" placeholder="Nueva contraseña" aria-label="Nueva contraseña" />
        <button className="primary" type="submit">{recoveryCode ? "Cambiar" : "Pedir codigo"}</button>
        <button type="button" onClick={() => setMode("login")}>Entrar</button>
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
          await onLogin(email, password);
        } catch (loginError) {
          setError(loginError.message);
        }
      }}
    >
      <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="Correo" aria-label="Correo" />
      <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="Contraseña" aria-label="Contraseña" />
      <button className="primary" type="submit">Entrar</button>
      <button type="button" onClick={() => setMode("recover")}>Recuperar</button>
      {error && <small className="auth-error">{error}</small>}
    </form>
  );
}

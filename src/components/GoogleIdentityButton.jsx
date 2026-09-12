import { useEffect, useRef, useState } from "react";
import { fetchGoogleAuthConfig } from "../lib/api.js";

let googleScriptPromise = null;

function loadGoogleScript() {
  if (typeof window === "undefined") return Promise.reject(new Error("Google no disponible."));
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!googleScriptPromise) {
    googleScriptPromise = new Promise((resolve, reject) => {
      const existingScript = document.querySelector("script[data-google-identity]");
      if (existingScript) {
        existingScript.addEventListener("load", resolve, { once: true });
        existingScript.addEventListener("error", reject, { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.dataset.googleIdentity = "true";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("No se pudo cargar Google."));
      document.head.appendChild(script);
    });
  }
  return googleScriptPromise;
}

export function readGoogleCredentialProfile(credential) {
  try {
    const [, payload] = String(credential || "").split(".");
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const rawPayload = window.atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
    const bytes = Uint8Array.from(rawPayload, (character) => character.charCodeAt(0));
    const decoded = JSON.parse(new TextDecoder().decode(bytes));
    return {
      email: String(decoded.email || "").trim().toLowerCase(),
      name: String(decoded.name || decoded.email || "").trim(),
      picture: String(decoded.picture || "").trim()
    };
  } catch {
    return null;
  }
}

export function GoogleIdentityButton({
  children = null,
  className = "",
  disabled = false,
  label = "Continuar con Google",
  onCredential,
  text = "continue_with"
}) {
  const buttonRef = useRef(null);
  const [config, setConfig] = useState({ enabled: false, clientId: "", loading: true });
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    fetchGoogleAuthConfig()
      .then((payload) => {
        if (!alive) return;
        setConfig({ enabled: Boolean(payload.enabled && payload.clientId), clientId: payload.clientId || "", loading: false });
      })
      .catch(() => {
        if (alive) setConfig({ enabled: false, clientId: "", loading: false });
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!config.enabled || disabled || !buttonRef.current) return undefined;
    let cancelled = false;
    setError("");
    loadGoogleScript()
      .then(() => {
        if (cancelled || !buttonRef.current) return;
        buttonRef.current.innerHTML = "";
        window.google.accounts.id.initialize({
          client_id: config.clientId,
          callback: (response) => {
            if (response?.credential) onCredential(response.credential);
          }
        });
        window.google.accounts.id.renderButton(buttonRef.current, {
          logo_alignment: "left",
          shape: "rectangular",
          size: "large",
          text,
          theme: "outline",
          width: Math.min(400, Math.max(240, buttonRef.current.clientWidth || 320))
        });
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError.message || "Google no disponible.");
      });
    return () => {
      cancelled = true;
    };
  }, [config.clientId, config.enabled, disabled, onCredential, text]);

  if (config.loading || !config.enabled) return null;

  return (
    <div className={className || "google-identity"}>
      {children}
      <div aria-label={label} className="google-identity-button" ref={buttonRef} />
      {error && <small className="google-identity-error">{error}</small>}
    </div>
  );
}

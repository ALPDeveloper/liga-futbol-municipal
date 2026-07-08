import { useEffect, useState } from "react";
import alpLogo from "../../assets/alp-logo.png";
import ligatecLogo from "../../assets/ligatec-logo.png";

const INTRO_ANIMATION_ENABLED = true;
const INTRO_STORAGE_KEY = "ligatec_intro_seen_at";
const INTRO_REPLAY_AFTER_MS = 12 * 60 * 60 * 1000;
const INTRO_DURATION_MS = 1900;
const INTRO_REDUCED_MOTION_MS = 750;
const INTRO_RESET_QUERY_VALUE = "reset";

function shouldShowIntro() {
  if (!INTRO_ANIMATION_ENABLED) return false;

  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("intro") === INTRO_RESET_QUERY_VALUE) {
      localStorage.removeItem(INTRO_STORAGE_KEY);
      return true;
    }

    const seenAt = Number(localStorage.getItem(INTRO_STORAGE_KEY) || 0);
    return !seenAt || Date.now() - seenAt > INTRO_REPLAY_AFTER_MS;
  } catch {
    return true;
  }
}

function markIntroSeen() {
  try {
    localStorage.setItem(INTRO_STORAGE_KEY, String(Date.now()));
  } catch {
    // Si el navegador bloquea localStorage, la portada sigue funcionando normal.
  }
}

export function IntroAnimation() {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!shouldShowIntro()) return undefined;

    const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const duration = prefersReducedMotion ? INTRO_REDUCED_MOTION_MS : INTRO_DURATION_MS;
    const fadeDuration = prefersReducedMotion ? 180 : 420;
    const leaveTimer = window.setTimeout(() => setLeaving(true), Math.max(0, duration - fadeDuration));
    const hideTimer = window.setTimeout(() => setVisible(false), duration);

    markIntroSeen();
    setVisible(true);

    return () => {
      window.clearTimeout(leaveTimer);
      window.clearTimeout(hideTimer);
    };
  }, []);

  function skipIntro() {
    setLeaving(true);
    window.setTimeout(() => setVisible(false), 180);
  }

  if (!visible) return null;

  return (
    <div className={`intro-animation ${leaving ? "is-leaving" : ""}`} role="status" aria-label="Presentacion LIGATEC">
      <div className="intro-stadium-lights" aria-hidden="true" />
      <div className="intro-field-lines" aria-hidden="true" />
      <div className="intro-content">
        <span className="intro-logo-frame">
          <img alt="LIGA TEC" src={ligatecLogo} />
        </span>
        <strong>LIGATEC</strong>
        <p>La evolucion digital de tu liga</p>
      </div>
      <div className="intro-dev">
        <span>Desarrollado por</span>
        <img alt="ALP DEV" src={alpLogo} />
      </div>
      <button className="intro-skip" type="button" onClick={skipIntro}>
        Saltar
      </button>
    </div>
  );
}

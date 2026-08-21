import { useEffect, useRef, useState } from "react";
import {
  PLAYER_PHOTO_ACCEPT,
  getPlayerPhotoInitials,
  optimizePlayerPhoto,
  validatePlayerPhotoFile
} from "../lib/playerPhotoProcessing.js";

const CROP_SIZE = 280;

export function PlayerPhotoUploader({
  existingPhotoUrl = "",
  defaultAuthorized = false,
  playerName = "",
  compact = false,
  addLabel = "Agregar foto del jugador",
  changeLabel = "Cambiar foto",
  removeLabel = "Quitar foto",
  authorizedLabel = "Foto autorizada",
  authorizeFirstLabel = "Autoriza foto primero",
  authorizationHint = "Para subir foto, primero marca la autorizacion del jugador."
}) {
  const [sourceUrl, setSourceUrl] = useState("");
  const [photoDataUrl, setPhotoDataUrl] = useState("");
  const [authorized, setAuthorized] = useState(defaultAuthorized);
  const [removed, setRemoved] = useState(false);
  const [crop, setCrop] = useState({ zoom: 1, offsetX: 0, offsetY: 0 });
  const [drag, setDrag] = useState(null);
  const [error, setError] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const sourceObjectUrlRef = useRef("");

  const visiblePhotoUrl = removed ? "" : photoDataUrl || sourceUrl || existingPhotoUrl;
  const initials = getPlayerPhotoInitials(playerName);

  useEffect(() => {
    setAuthorized(defaultAuthorized);
  }, [defaultAuthorized]);

  useEffect(() => () => {
    if (sourceObjectUrlRef.current) URL.revokeObjectURL(sourceObjectUrlRef.current);
  }, []);

  useEffect(() => {
    if (!sourceUrl || removed || !authorized) {
      setPhotoDataUrl("");
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setIsProcessing(true);
      try {
        const dataUrl = await optimizePlayerPhoto({ imageUrl: sourceUrl, crop, cropSize: CROP_SIZE });
        if (!cancelled) {
          setPhotoDataUrl(dataUrl);
          setError("");
        }
      } catch (processingError) {
        if (!cancelled) {
          setPhotoDataUrl("");
          setError(processingError.message || "No se pudo procesar la imagen.");
        }
      } finally {
        if (!cancelled) setIsProcessing(false);
      }
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [authorized, crop, removed, sourceUrl]);

  function handleFileChange(event) {
    const file = event.target.files?.[0];
    setError("");
    if (!file) return;
    if (!authorized) {
      event.target.value = "";
      setError("Marca la autorizacion de foto antes de subir el archivo.");
      return;
    }

    try {
      validatePlayerPhotoFile(file);
      if (sourceObjectUrlRef.current) URL.revokeObjectURL(sourceObjectUrlRef.current);
      const nextUrl = URL.createObjectURL(file);
      sourceObjectUrlRef.current = nextUrl;
      setSourceUrl(nextUrl);
      setPhotoDataUrl("");
      setRemoved(false);
      setCrop({ zoom: 1, offsetX: 0, offsetY: 0 });
    } catch (validationError) {
      event.target.value = "";
      setSourceUrl("");
      setPhotoDataUrl("");
      setError(validationError.message || "No se pudo cargar la foto.");
    }
  }

  function removePhoto() {
    setRemoved(true);
    setSourceUrl("");
    setPhotoDataUrl("");
    setError("");
    if (sourceObjectUrlRef.current) {
      URL.revokeObjectURL(sourceObjectUrlRef.current);
      sourceObjectUrlRef.current = "";
    }
  }

  function startDrag(event) {
    if (!sourceUrl) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDrag({
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startOffsetX: crop.offsetX,
      startOffsetY: crop.offsetY
    });
  }

  function moveDrag(event) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const maxOffset = getMaxCropOffset(crop.zoom);
    setCrop((current) => ({
      ...current,
      offsetX: clamp(drag.startOffsetX + event.clientX - drag.startX, -maxOffset, maxOffset),
      offsetY: clamp(drag.startOffsetY + event.clientY - drag.startY, -maxOffset, maxOffset)
    }));
  }

  function endDrag(event) {
    if (drag?.pointerId === event.pointerId) setDrag(null);
  }

  return (
    <div className={`player-photo-uploader ${compact ? "compact" : ""}`}>
      <input type="hidden" name="photoDataUrl" value={photoDataUrl} />
      <input type="hidden" name="removePhoto" value={removed ? "on" : ""} />
      <input type="hidden" name="photoAuthorized" value={authorized ? "true" : "false"} />

      <div className="player-photo-top">
        <div className="player-photo-preview" aria-label="Vista previa de foto del jugador">
          {visiblePhotoUrl ? <img alt="" src={visiblePhotoUrl} /> : <span>{initials}</span>}
        </div>
        <div className="player-photo-actions">
          <label className={`player-photo-file ${!authorized ? "disabled" : ""}`}>
            {!authorized ? authorizeFirstLabel : visiblePhotoUrl ? changeLabel : addLabel}
            <input disabled={!authorized} type="file" accept={PLAYER_PHOTO_ACCEPT} onChange={handleFileChange} />
          </label>
          {visiblePhotoUrl && (
            <button type="button" className="secondary" onClick={removePhoto}>{removeLabel}</button>
          )}
          <label className="checkbox-field compact-checkbox player-photo-auth">
            <input
              checked={authorized}
              type="checkbox"
              onChange={(event) => {
                setAuthorized(event.target.checked);
                if (event.target.checked) setRemoved(false);
              }}
            />
            {authorizedLabel}
          </label>
          {!authorized && <small className="player-photo-permission-hint">{authorizationHint}</small>}
        </div>
      </div>

      {sourceUrl && authorized && !removed && (
        <div className="player-photo-editor">
          <div
            className={`player-photo-crop ${drag ? "dragging" : ""}`}
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <img
              alt=""
              draggable="false"
              src={sourceUrl}
              style={{
                transform: `translate(calc(-50% + ${crop.offsetX}px), calc(-50% + ${crop.offsetY}px)) scale(${crop.zoom})`
              }}
            />
          </div>
          <label className="player-photo-zoom">
            Zoom
            <input
              max="3"
              min="1"
              step="0.05"
              type="range"
              value={crop.zoom}
              onChange={(event) => {
                const zoom = Number(event.target.value);
                const maxOffset = getMaxCropOffset(zoom);
                setCrop((current) => ({
                  zoom,
                  offsetX: clamp(current.offsetX, -maxOffset, maxOffset),
                  offsetY: clamp(current.offsetY, -maxOffset, maxOffset)
                }));
              }}
            />
          </label>
          <small>{isProcessing ? "Optimizando foto..." : "Mueve la imagen para centrar el rostro. Se guardara cuadrada en WebP."}</small>
        </div>
      )}

      {error && <p className="auth-error">{error}</p>}
    </div>
  );
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getMaxCropOffset(zoom) {
  return (CROP_SIZE * (Number(zoom || 1) - 1)) / 2;
}

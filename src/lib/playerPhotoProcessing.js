export const PLAYER_PHOTO_OUTPUT_SIZE = 800;
export const PLAYER_PHOTO_QUALITY = 0.78;
export const PLAYER_PHOTO_MAX_ORIGINAL_BYTES = 15 * 1024 * 1024;
export const PLAYER_PHOTO_ACCEPT = "image/png,image/jpeg,image/webp";

const ALLOWED_PLAYER_PHOTO_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export function validatePlayerPhotoFile(file) {
  if (!file) return;
  if (!ALLOWED_PLAYER_PHOTO_TYPES.has(file.type)) {
    throw new Error("Solo se permiten fotos JPG, PNG o WebP.");
  }
  if (file.size > PLAYER_PHOTO_MAX_ORIGINAL_BYTES) {
    throw new Error("La imagen original es demasiado pesada. El maximo permitido es 15 MB.");
  }
}

export function getPlayerPhotoInitials(name) {
  const parts = String(name || "J")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "J";
  return parts.slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase("es-MX");
}

export async function optimizePlayerPhoto({ imageUrl, crop, cropSize = 280 }) {
  const image = await loadImage(imageUrl);
  const outputSize = PLAYER_PHOTO_OUTPUT_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("No se pudo procesar la imagen.");

  context.fillStyle = "#f3f7fb";
  context.fillRect(0, 0, outputSize, outputSize);

  const baseScale = Math.max(cropSize / image.naturalWidth, cropSize / image.naturalHeight);
  const zoom = clamp(Number(crop?.zoom || 1), 1, 3);
  const scale = (outputSize / cropSize) * baseScale * zoom;
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  const offsetX = Number(crop?.offsetX || 0) * (outputSize / cropSize);
  const offsetY = Number(crop?.offsetY || 0) * (outputSize / cropSize);

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    outputSize / 2 + offsetX - drawWidth / 2,
    outputSize / 2 + offsetY - drawHeight / 2,
    drawWidth,
    drawHeight
  );

  return canvasToDataUrl(canvas);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("No se pudo leer la foto seleccionada."));
    image.src = src;
  });
}

function canvasToDataUrl(canvas) {
  return new Promise((resolve, reject) => {
    if (!canvas.toBlob) {
      resolve(canvas.toDataURL("image/webp", PLAYER_PHOTO_QUALITY));
      return;
    }

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("No se pudo optimizar la foto."));
          return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("No se pudo preparar la foto optimizada."));
        reader.readAsDataURL(blob);
      },
      "image/webp",
      PLAYER_PHOTO_QUALITY
    );
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

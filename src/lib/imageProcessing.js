export const IMAGE_UPLOAD_ACCEPT = "image/png,image/jpeg,image/webp";
export const IMAGE_MAX_ORIGINAL_BYTES = 15 * 1024 * 1024;
export const IMAGE_TARGET_BYTES = 1_250_000;
export const IMAGE_DEFAULT_MAX_SIZE = 1400;
export const IMAGE_LOGO_MAX_SIZE = 900;
export const IMAGE_BANNER_MAX_SIZE = 1800;
export const IMAGE_WEBP_QUALITY = 0.82;

const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export function validateWebImageFile(file) {
  if (!file) return;
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error("Solo se permiten imagenes PNG, JPG o WebP.");
  }
  if (file.size > IMAGE_MAX_ORIGINAL_BYTES) {
    throw new Error("La imagen original es demasiado pesada. El maximo permitido es 15 MB.");
  }
}

export async function optimizeWebImageFile(file, { maxSize = IMAGE_DEFAULT_MAX_SIZE, quality = IMAGE_WEBP_QUALITY, background = null } = {}) {
  validateWebImageFile(file);
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await loadImage(objectUrl);
    const largestSide = Math.max(image.naturalWidth || 1, image.naturalHeight || 1);
    const scale = Math.min(1, Number(maxSize || IMAGE_DEFAULT_MAX_SIZE) / largestSide);
    const width = Math.max(1, Math.round((image.naturalWidth || 1) * scale));
    const height = Math.max(1, Math.round((image.naturalHeight || 1) * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: background === null });
    if (!context) throw new Error("No se pudo procesar la imagen.");

    if (background) {
      context.fillStyle = background;
      context.fillRect(0, 0, width, height);
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, width, height);

    let nextQuality = quality;
    let dataUrl = await canvasToDataUrl(canvas, "image/webp", nextQuality);
    while (estimateDataUrlBytes(dataUrl) > IMAGE_TARGET_BYTES && nextQuality > 0.58) {
      nextQuality -= 0.08;
      dataUrl = await canvasToDataUrl(canvas, "image/webp", nextQuality);
    }
    return dataUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("No se pudo leer la imagen seleccionada."));
    image.src = src;
  });
}

function canvasToDataUrl(canvas, mimeType, quality) {
  return new Promise((resolve, reject) => {
    if (!canvas.toBlob) {
      resolve(canvas.toDataURL(mimeType, quality));
      return;
    }
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("No se pudo optimizar la imagen."));
          return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("No se pudo preparar la imagen optimizada."));
        reader.readAsDataURL(blob);
      },
      mimeType,
      quality
    );
  });
}

function estimateDataUrlBytes(dataUrl) {
  const base64 = String(dataUrl || "").split(",")[1] || "";
  return Math.round((base64.length * 3) / 4);
}

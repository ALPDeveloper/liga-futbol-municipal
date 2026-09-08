import assert from "node:assert/strict";

const { parseImageDataUrl } = await import("../server/imageStorage.js");

function makePngDataUrl(byteLength) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const buffer = Buffer.concat([signature, Buffer.alloc(Math.max(0, byteLength - signature.length), 0)]);
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

const validImage = parseImageDataUrl(makePngDataUrl(120_000), { maxBytes: 180_000 });
assert.equal(validImage.mimeType, "image/png");
assert.equal(validImage.sizeBytes, 120_000);

assert.throws(
  () => parseImageDataUrl(makePngDataUrl(450_000), { maxBytes: 400_000 }),
  /debe pesar menos de 400 KB/
);

console.log("Guardas de subida de imagen OK");

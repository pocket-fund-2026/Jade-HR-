// Vercel rejects request bodies over ~4.5MB with a 413 before our API ever
// runs, and base64 inflates a file by a third. Phone photos are routinely
// 4-10MB, so shrink images client-side and fail clearly for anything else.
const MAX_BASE64_CHARS = 3_000_000;

function readDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("decode")); };
    img.src = url;
  });
}

async function shrinkImage(file) {
  const img = await loadImage(file);
  let maxSide = 1800;
  let quality = 0.8;
  for (let i = 0; i < 5; i++) {
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", quality));
    const dataUrl = await readDataUrl(blob);
    if (dataUrl.length <= MAX_BASE64_CHARS) return { dataUrl, contentType: "image/jpeg" };
    maxSide = Math.round(maxSide * 0.75);
    quality = Math.max(0.5, quality - 0.1);
  }
  throw new Error("too large");
}

/** Resolves to { content_base64, content_type, filename } safe to POST. */
export async function prepareUpload(file) {
  const tooLarge = new Error("That file is too large — please attach a smaller file or a photo.");
  const original = await readDataUrl(file);
  if (original.length <= MAX_BASE64_CHARS) {
    return { content_base64: original, content_type: file.type || "application/octet-stream", filename: file.name };
  }
  if (!file.type.startsWith("image/")) throw tooLarge;
  try {
    const { dataUrl, contentType } = await shrinkImage(file);
    return {
      content_base64: dataUrl,
      content_type: contentType,
      filename: file.name.replace(/\.[^.]+$/, "") + ".jpg",
    };
  } catch {
    throw tooLarge;
  }
}

// Draws a typed full name in a handwriting font to a transparent PNG, so the
// e-signature looks like a real signature everywhere it ends up (sign page,
// PDF, print). Falls back to a generic cursive if the font can't load.
const STACK = '"Great Vibes", "Brush Script MT", "Segoe Script", "Lucida Handwriting", cursive';
export const SIGNATURE_FONT_STACK = STACK;

export async function signatureImage(name) {
  const text = (name || "").trim();
  if (!text) return "";
  try { await document.fonts.load('64px "Great Vibes"', text); } catch { /* fall back to stack */ }
  const size = 64;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  ctx.font = `${size}px ${STACK}`;
  const w = Math.ceil(ctx.measureText(text).width) + 40;
  canvas.width = w;
  canvas.height = Math.ceil(size * 1.6);
  ctx.font = `${size}px ${STACK}`; // resizing resets the context
  ctx.fillStyle = "#1a2a6c";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 20, canvas.height / 2);
  return canvas.toDataURL("image/png");
}

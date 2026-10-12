import { Camera, Trash2 } from "lucide-react";
import { useRef, useState } from "react";

import api from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";

// Centre-crops to a 256px square JPEG in the browser, so uploads are ~20 KB
// whatever the phone camera produced.
function resizeToSquareJpeg(file, size = 256) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      canvas.getContext("2d").drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read that image")); };
    img.src = url;
  });
}

// The signed-in user's photo (or initial). Click to change it; a small bin
// button removes it. `className` sets the size/shape.
export default function Avatar({ className = "w-9 h-9", editable = true }) {
  const { user, reloadUser } = useAuth();
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState(null);

  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    try {
      setPreview(await resizeToSquareJpeg(file));
    } catch (err) {
      setError(err.message || "Could not read that image");
    }
  };

  const close = () => { setOpen(false); setPreview(null); setError(""); };

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await api.post("/api/auth/me/avatar", { content_base64: preview, content_type: "image/jpeg" });
      await reloadUser();
      close();
    } catch (err) {
      setError(err.response?.data?.detail || err.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError("");
    try {
      await api.delete("/api/auth/me/avatar");
      await reloadUser();
      close();
    } catch (err) {
      setError(err.response?.data?.detail || "Could not remove the photo");
    } finally {
      setBusy(false);
    }
  };

  const initial = (user?.name || "?").trim().charAt(0).toUpperCase();
  const face = user?.avatar_url ? (
    <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
  ) : (
    <span className="text-sm font-semibold">{initial}</span>
  );

  if (!editable) {
    return <span className={`${className} rounded-full bg-manila/15 text-manila flex items-center justify-center overflow-hidden flex-shrink-0`}>{face}</span>;
  }
  return (
    <>
      <span className="relative inline-block flex-shrink-0 group">
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Change profile photo"
          aria-label="Change profile photo"
          className={`${className} rounded-full bg-manila/15 text-manila flex items-center justify-center overflow-hidden relative focus:outline-none focus-visible:ring-2 focus-visible:ring-manila`}
        >
          {face}
          <span className="absolute inset-0 bg-ledger-900/55 text-manila flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity">
            <Camera size={14} />
          </span>
        </button>
      </span>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4" role="dialog" aria-modal="true" aria-label="Profile photo" onClick={close}>
          <div className="bg-paper rounded-md shadow-card w-full max-w-sm p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-xl text-ink mb-4">Profile photo</h3>
            <div className="mx-auto w-32 h-32 rounded-full overflow-hidden bg-manila flex items-center justify-center text-ink/60 text-4xl font-semibold">
              {preview ? <img src={preview} alt="Preview" className="w-full h-full object-cover" /> : user?.avatar_url ? <img src={user.avatar_url} alt="" className="w-full h-full object-cover" /> : initial}
            </div>
            <p className="text-xs text-ink/60 mt-3">{preview ? "This is how it will look. It is cropped to a square." : "Pick a clear photo of your face. It is cropped to a square."}</p>
            {error && <p className="text-sm text-rust-500 mt-3">{error}</p>}
            <div className="mt-5 flex flex-col gap-2">
              {preview ? (
                <button type="button" onClick={save} disabled={busy} className="min-h-[44px] rounded-sm bg-ledger-800 text-manila text-sm font-semibold hover:bg-ledger-700 disabled:opacity-50">{busy ? "Saving…" : "Save photo"}</button>
              ) : null}
              <button type="button" onClick={() => input.current?.click()} disabled={busy} className="min-h-[44px] rounded-sm border border-ink/15 bg-paper text-ink text-sm font-semibold hover:border-jade-500">{preview ? "Choose a different photo" : "Choose a photo"}</button>
              {!preview && user?.avatar_url && (
                <button type="button" onClick={remove} disabled={busy} className="min-h-[44px] rounded-sm text-rust-500 text-sm font-semibold hover:bg-rust-50 flex items-center justify-center gap-2"><Trash2 size={14} /> Remove current photo</button>
              )}
              <button type="button" onClick={close} className="min-h-[44px] text-sm text-ink/60 hover:text-ink">Cancel</button>
            </div>
          </div>
        </div>
      )}
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={pick} />
    </>
  );
}

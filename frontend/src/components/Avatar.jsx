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

  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const content_base64 = await resizeToSquareJpeg(file);
      await api.post("/api/auth/me/avatar", { content_base64, content_type: "image/jpeg" });
      await reloadUser();
    } catch (err) {
      setError(err.response?.data?.detail || err.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.delete("/api/auth/me/avatar");
      await reloadUser();
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
    <span className="relative inline-block flex-shrink-0 group">
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        title={error || "Change profile photo"}
        aria-label="Change profile photo"
        className={`${className} rounded-full bg-manila/15 text-manila flex items-center justify-center overflow-hidden relative focus:outline-none focus-visible:ring-2 focus-visible:ring-manila disabled:opacity-60`}
      >
        {face}
        <span className="absolute inset-0 bg-ledger-900/55 text-manila flex items-center justify-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <Camera size={14} />
        </span>
      </button>
      {user?.avatar_url && !busy && (
        <button type="button" onClick={remove} title="Remove photo" aria-label="Remove profile photo"
          className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-ledger-900 text-manila border border-manila/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <Trash2 size={10} />
        </button>
      )}
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={pick} />
    </span>
  );
}

import { Camera, CheckCircle2, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import api from "../lib/api.js";
import { formatTime } from "../lib/format.js";

// idle -> capturing -> preview -> submitting -> idle
export default function SelfieCheckinCard() {
  const [status, setStatus] = useState(null);
  const [mode, setMode] = useState("idle");
  const [photo, setPhoto] = useState(null);
  const [error, setError] = useState("");
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const loadStatus = () => {
    api.get("/api/me/selfie-status").then((res) => setStatus(res.data)).catch(() => {});
  };

  useEffect(loadStatus, []);

  useEffect(() => () => stopStream(), []);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const startCapture = async () => {
    setError("");
    setMode("capturing");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      setError("Couldn't access the camera — check browser permissions.");
      setMode("idle");
    }
  };

  const capture = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    setPhoto(canvas.toDataURL("image/jpeg", 0.85));
    stopStream();
    setMode("preview");
  };

  const retake = () => {
    setPhoto(null);
    startCapture();
  };

  const cancel = () => {
    stopStream();
    setPhoto(null);
    setMode("idle");
    setError("");
  };

  const submit = async () => {
    setMode("submitting");
    setError("");
    try {
      await api.post("/api/me/selfie-checkin", { photo_base64: photo });
      setPhoto(null);
      setMode("idle");
      loadStatus();
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't submit — try again");
      setMode("preview");
    }
  };

  if (!status?.requires_selfie_checkin) return null;

  const punches = status.todays_punches || [];
  const nextAction = punches.length === 0 ? "Check In" : "Check Out";

  return (
    <div className="bg-paper rounded-sm shadow-card p-5 mb-6 border-t-4 border-jade-500">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-jade-700">Selfie check-in</p>
        {mode === "idle" && punches.length > 0 && (
          <span className="text-xs text-ink/40">
            {punches.map((p, i) => (
              <span key={i}>{i > 0 && " · "}{p.punch_direction === "IN" ? "In" : "Out"} {formatTime(p.punch_time)}</span>
            ))}
          </span>
        )}
      </div>

      {error && <p className="text-sm text-rust-500 border-l-2 border-rust-500 pl-2.5 py-0.5 mb-3">{error}</p>}

      {mode === "idle" && (
        <button
          onClick={startCapture}
          className="flex items-center gap-2 bg-jade-600 text-white px-4 py-2.5 rounded-sm text-sm font-semibold hover:bg-jade-700 transition-colors"
        >
          <Camera size={15} /> {nextAction} with selfie
        </button>
      )}

      {mode === "capturing" && (
        <div className="space-y-3">
          <video ref={videoRef} className="w-full max-w-xs rounded-sm bg-ledger-900 aspect-square object-cover" playsInline muted />
          <div className="flex gap-3">
            <button
              onClick={capture}
              className="flex items-center gap-2 bg-ledger-800 text-manila px-4 py-2.5 rounded-sm text-sm font-semibold hover:bg-ledger-700 transition-colors"
            >
              <Camera size={15} /> Capture
            </button>
            <button onClick={cancel} className="flex items-center gap-2 text-sm text-ink/50 hover:text-ink px-2">
              <X size={15} /> Cancel
            </button>
          </div>
        </div>
      )}

      {(mode === "preview" || mode === "submitting") && photo && (
        <div className="space-y-3">
          <img src={photo} alt="Selfie preview" className="w-full max-w-xs rounded-sm aspect-square object-cover" />
          <div className="flex gap-3">
            <button
              onClick={submit}
              disabled={mode === "submitting"}
              className="flex items-center gap-2 bg-jade-600 text-white px-4 py-2.5 rounded-sm text-sm font-semibold hover:bg-jade-700 disabled:opacity-50 transition-colors"
            >
              <CheckCircle2 size={15} /> {mode === "submitting" ? "Submitting…" : `Confirm ${nextAction.toLowerCase()}`}
            </button>
            <button
              onClick={retake}
              disabled={mode === "submitting"}
              className="flex items-center gap-2 text-sm text-ink/50 hover:text-ink px-2"
            >
              <RotateCcw size={15} /> Retake
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

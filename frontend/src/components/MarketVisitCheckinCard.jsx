import { Camera, CheckCircle2, MapPin, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import api from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";

const SUCCESS_MS = 2200;

// idle -> locating -> capturing -> preview -> submitting -> success -> idle
export default function MarketVisitCheckinCard() {
  const { user } = useAuth() || {};
  const [mode, setMode] = useState("idle");
  const [photo, setPhoto] = useState(null);
  const [location, setLocation] = useState(null);
  const [error, setError] = useState("");
  const [justSubmitted, setJustSubmitted] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const dismissTimer = useRef(null);

  useEffect(() => () => clearTimeout(dismissTimer.current), []);
  useEffect(() => () => stopStream(), []);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const start = () => {
    setError("");
    setPhoto(null);
    setLocation(null);
    setMode("locating");
    if (!navigator.geolocation) {
      setError("This browser doesn't support location — can't check in from here.");
      setMode("idle");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy });
        startCapture();
      },
      () => {
        setError("Couldn't get your location — check location permissions and try again.");
        setMode("idle");
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const startCapture = async () => {
    setMode("capturing");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
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
    setLocation(null);
    setMode("idle");
    setError("");
  };

  const submit = async () => {
    setMode("submitting");
    setError("");
    try {
      await api.post("/api/market-visits", {
        photo_base64: photo,
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy,
      });
      setPhoto(null);
      setLocation(null);
      setJustSubmitted(true);
      setMode("success");
      dismissTimer.current = setTimeout(() => setMode("idle"), SUCCESS_MS);
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't submit — try again");
      setMode("preview");
    }
  };

  const dismissSuccess = () => {
    clearTimeout(dismissTimer.current);
    setJustSubmitted(false);
    setMode("idle");
  };

  if (!user?.market_visit_checkin_enabled) return null;

  return (
    <div className="bg-paper rounded-sm shadow-card p-5 mb-6 border-t-4 border-jade-500">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-jade-700">Market visit check-in</p>
      </div>

      {error && <p className="text-sm text-rust-500 border-l-2 border-rust-500 pl-2.5 py-0.5 mb-3">{error}</p>}

      {mode === "idle" && (
        <button
          onClick={start}
          className="flex items-center gap-2 bg-jade-600 text-white px-4 py-2.5 rounded-sm text-sm font-semibold hover:bg-jade-700 transition-colors"
        >
          <MapPin size={15} /> Check in from here
        </button>
      )}

      {mode === "locating" && (
        <p className="text-sm text-ink/70 flex items-center gap-2">
          <MapPin size={14} className="animate-pulse" /> Getting your location…
        </p>
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
            <button onClick={cancel} className="flex items-center gap-2 text-sm text-ink/70 hover:text-ink px-2">
              <X size={15} /> Cancel
            </button>
          </div>
        </div>
      )}

      {(mode === "preview" || mode === "submitting") && photo && (
        <div className="space-y-3">
          <img src={photo} alt="Check-in preview" className="w-full max-w-xs rounded-sm aspect-square object-cover" />
          {location && (
            <p className="text-xs text-ink/70 font-nums flex items-center gap-1">
              <MapPin size={12} /> {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
              {location.accuracy ? ` (±${Math.round(location.accuracy)}m)` : ""}
            </p>
          )}
          <div className="flex gap-3">
            <button
              onClick={submit}
              disabled={mode === "submitting"}
              className="flex items-center gap-2 bg-jade-600 text-white px-4 py-2.5 rounded-sm text-sm font-semibold hover:bg-jade-700 disabled:opacity-50 transition-colors"
            >
              <CheckCircle2 size={15} /> {mode === "submitting" ? "Submitting…" : "Submit check-in"}
            </button>
            <button
              onClick={retake}
              disabled={mode === "submitting"}
              className="flex items-center gap-2 text-sm text-ink/70 hover:text-ink px-2"
            >
              <RotateCcw size={15} /> Retake
            </button>
          </div>
        </div>
      )}

      {mode === "success" && justSubmitted && (
        <button onClick={dismissSuccess} className="w-full text-left group">
          <div className="flex items-center gap-4 py-1">
            <span className="stamp stamp-land text-jade-600 text-sm px-3 py-1.5 flex-shrink-0">Submitted</span>
            <span className="text-ink/70 text-sm">Awaiting your manager's review</span>
            <span className="ml-auto text-xs text-ink/65 group-hover:text-ink/70 transition-colors">Tap to dismiss</span>
          </div>
        </button>
      )}
    </div>
  );
}

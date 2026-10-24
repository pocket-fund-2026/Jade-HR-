import { useEffect, useState } from "react";

const CHECK_EVERY_MS = 5 * 60 * 1000;

// Open tabs keep running the JS they loaded, so a fix never reaches people who
// don't refresh. Poll the build id and ask them to reload when a newer one ships.
export default function UpdateBanner() {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (typeof __BUILD_ID__ === "undefined" || import.meta.env.DEV) return undefined;
    const check = async () => {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok || !(res.headers.get("content-type") || "").includes("json")) return;
        const { build } = await res.json();
        if (build && build !== __BUILD_ID__) setStale(true);
      } catch {
        /* offline or blocked: try again next tick */
      }
    };
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    const timer = setInterval(check, CHECK_EVERY_MS);
    document.addEventListener("visibilitychange", onVisible);
    check();
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, []);

  if (!stale) return null;
  return (
    <div role="status" className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] bg-ledger-900 text-manila text-sm rounded-sm shadow-stamp px-4 py-3 flex items-center gap-3">
      <span>A new version of JADE HR is available.</span>
      <button onClick={() => window.location.reload()} className="bg-jade-500 text-white font-semibold rounded-sm px-3 py-1">
        Refresh
      </button>
    </div>
  );
}

import { Award, Cake, X } from "lucide-react";
import { useEffect, useState } from "react";

import api from "../lib/api.js";

// Dismissal is by calendar date (not a growing "seen" set) so the popup comes
// back each new day it's still true. Keys are the same ones the admin
// Dashboard used before this moved to a login-wide popup, so anyone who
// already dismissed today's notice isn't shown it again.
const BIRTHDAY_DISMISS_KEY = "jade_hr_birthday_dismissed_date";
const ANNIVERSARY_DISMISS_KEY = "jade_hr_anniversary_dismissed_date";

const todayIso = () => new Date().toISOString().slice(0, 10);

function read(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

export default function CelebrationPopup() {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    api.get("/api/employees/celebrations").then(({ data }) => setData(data)).catch(() => {});
  }, []);

  if (!data || !open) return null;
  const today = todayIso();
  const birthdays = read(BIRTHDAY_DISMISS_KEY) === today ? [] : data.birthdays;
  const anniversaries = read(ANNIVERSARY_DISMISS_KEY) === today ? [] : data.anniversaries;
  if (!birthdays.length && !anniversaries.length) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(BIRTHDAY_DISMISS_KEY, today);
      localStorage.setItem(ANNIVERSARY_DISMISS_KEY, today);
    } catch { /* storage blocked — popup just closes for this view */ }
    setOpen(false);
  };

  return (
    <div className="fixed inset-0 bg-ledger-900/60 flex items-center justify-center px-4 z-[90]">
      <div className="bg-paper rounded-sm shadow-stamp w-full max-w-sm p-7 border-t-4 border-jade-500 relative text-center max-h-[90vh] overflow-y-auto">
        <button onClick={dismiss} aria-label="Close" className="absolute top-4 right-4 text-ink/70 hover:text-ink transition-colors">
          <X size={18} />
        </button>
        {birthdays.length > 0 && (
          <div className={anniversaries.length > 0 ? "mb-6" : ""}>
            <div className="w-14 h-14 rounded-full bg-jade-500/15 flex items-center justify-center mx-auto mb-4">
              <Cake size={26} className="text-jade-700" />
            </div>
            <p className="font-display text-lg text-ink mb-1">{birthdays.length > 1 ? "Birthdays today!" : "Birthday today!"}</p>
            <p className="text-sm text-ink/70">{birthdays.map((b) => b.name).join(", ")}</p>
          </div>
        )}
        {anniversaries.length > 0 && (
          <div>
            <div className="w-14 h-14 rounded-full bg-jade-500/15 flex items-center justify-center mx-auto mb-4">
              <Award size={26} className="text-jade-700" />
            </div>
            <p className="font-display text-lg text-ink mb-1">
              {anniversaries.length > 1 ? "Work anniversaries today!" : "Work anniversary today!"}
            </p>
            <p className="text-sm text-ink/70">
              {anniversaries.map((a) => `${a.name} (${a.years} yr${a.years === 1 ? "" : "s"})`).join(", ")}
            </p>
          </div>
        )}
        <button
          onClick={dismiss}
          className="mt-6 bg-ledger-800 text-manila px-[1.5em] py-[0.625em] leading-tight rounded-sm text-sm font-semibold hover:bg-ledger-700 transition-colors"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

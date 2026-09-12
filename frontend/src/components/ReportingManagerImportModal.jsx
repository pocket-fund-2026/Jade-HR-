import { Download, Upload, X } from "lucide-react";
import { useEffect, useState } from "react";

import api from "../lib/api.js";
import { parseCsv } from "../lib/csv.js";

export default function ReportingManagerImportModal({ onClose, onImported }) {
  const [rows, setRows] = useState(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [suggestions, setSuggestions] = useState(null);
  const [suggestionsLoading, setSuggestionsLoading] = useState(true);

  // Best-guess resolution of the existing free-text reporting_to field (e.g.
  // "Sagar", "Dharmesh/Akshay", "Ma'am/ Sir") to an actual employee_code —
  // loaded once up front so the template below can come prefilled with
  // matched rows instead of every row starting blank. Never writes anything
  // itself (see reporting_manager_suggestions' own docstring).
  useEffect(() => {
    api.get("/api/employees/reporting-manager-suggestions")
      .then(({ data }) => setSuggestions(data))
      .catch(() => setSuggestions([]))
      .finally(() => setSuggestionsLoading(false));
  }, []);

  const matchedCount = suggestions?.filter((s) => s.status === "matched").length ?? 0;
  const ambiguousCount = suggestions?.filter((s) => s.status === "ambiguous").length ?? 0;
  const unresolvedCount = suggestions?.filter((s) => s.status === "unresolved").length ?? 0;

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    setError("");
    setResult(null);
    const text = await file.text();
    const parsed = parseCsv(text);
    if (!parsed.length || !("employee_code" in parsed[0]) || !("manager_employee_code" in parsed[0])) {
      setError("CSV must have 'employee_code' and 'manager_employee_code' columns.");
      setRows(null);
      return;
    }
    setRows(parsed.filter((r) => r.manager_employee_code));
  };

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const payload = {
        rows: rows.map((r) => ({
          employee_code: r.employee_code,
          manager_employee_code: r.manager_employee_code,
        })),
      };
      const { data } = await api.post("/api/employees/bulk-reporting-manager", payload);
      setResult(data);
      if (data.not_found.length === 0 && data.no_manager_email.length === 0) {
        setTimeout(onImported, 1200);
      }
    } catch (err) {
      setError(err.response?.data?.detail || "Import failed — check the file and try again");
    } finally {
      setBusy(false);
    }
  };

  // Prefilled with every active employee's own code/name, plus (where the
  // existing free-text reporting_to field resolved unambiguously) a guessed
  // manager_employee_code — see reporting_manager_suggestions. Ambiguous/
  // unresolved rows come with their candidates or the original free text in
  // a Notes column instead of a guess, so HR reviews those specifically
  // rather than re-typing all ~150 rows from a blank sheet.
  const downloadTemplate = async () => {
    setDownloading(true);
    try {
      const { data } = await api.get("/api/employees", { params: { lite: true } });
      const suggestionByCode = new Map((suggestions || []).map((s) => [s.employee_code, s]));
      const lines = ["employee_code,name,manager_employee_code,notes"];
      data
        .filter((e) => e.is_active)
        .sort((a, b) => `${a.first_name}`.localeCompare(b.first_name))
        .forEach((e) => {
          const name = `${e.first_name} ${e.last_name || ""}`.trim().replace(/,/g, " ");
          const s = suggestionByCode.get(e.employee_code);
          let guess = "";
          let note = "";
          if (s?.status === "matched") {
            guess = s.suggested_manager_code;
            note = `auto-matched: "${s.reporting_to}" -> ${s.suggested_manager_name}. Confirm or correct.`;
          } else if (s?.status === "ambiguous") {
            note = `"${s.reporting_to}" is ambiguous — candidates: ${s.candidates.join(" | ")}`;
          } else if (s?.status === "unresolved") {
            note = `"${s.reporting_to}" didn't match any active employee`;
          }
          lines.push(`${e.employee_code},${name},${guess},"${note.replace(/"/g, "'")}"`);
        });
      const blob = new Blob([lines.join("\n")], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "jade-hr-reporting-manager-template.csv";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-ledger-900/60 flex items-center justify-center px-4 z-50">
      <div className="bg-paper rounded-sm shadow-stamp w-full max-w-lg p-6 border-t-4 border-jade-500 relative">
        <button onClick={onClose} aria-label="Close" className="absolute top-4 right-4 text-ink/70 hover:text-ink transition-colors">
          <X size={18} />
        </button>
        <p className="text-xs font-semibold uppercase tracking-wider text-jade-600 mb-1">Bulk import</p>
        <p className="font-display text-lg text-ink mb-1">Reporting Managers</p>
        <p className="text-xs text-ink/70 mb-3">
          Sets who each employee's late-coming digest email goes to (in addition to HR). Download the template — it's
          prefilled with every active employee's code/name and, where the existing "reporting to" note on file resolved
          to exactly one person, a guessed <code>manager_employee_code</code>. Review the guesses and the flagged rows
          in the Notes column, correct anything wrong, then re-upload.{" "}
          <button onClick={downloadTemplate} disabled={downloading || suggestionsLoading} className="text-jade-600 hover:underline inline-flex items-center gap-1 disabled:opacity-50">
            <Download size={11} /> {downloading ? "Preparing…" : "Download template"}
          </button>
        </p>

        {suggestionsLoading ? (
          <p className="text-xs text-ink/50 mb-5">Checking existing "reporting to" notes for matches…</p>
        ) : (
          <p className="text-xs text-ink/70 bg-manila/40 border-l-2 border-jade-500 px-3 py-2 mb-5">
            <strong className="text-jade-700">{matchedCount} auto-matched</strong> from the existing free-text
            field alone — still worth a glance since names can collide.{" "}
            {ambiguousCount > 0 && <>{ambiguousCount} ambiguous (multiple people share the name, or more than one name was
            written down) — candidates are listed per row. </>}
            {unresolvedCount > 0 && <>{unresolvedCount} need a fresh look (no name on file, or it matched nobody active).</>}
          </p>
        )}

        <label className="flex items-center gap-3 border border-dashed border-ink/25 rounded-sm px-4 py-4 cursor-pointer hover:border-jade-500 transition-colors">
          <Upload size={18} className="text-ink/70" />
          <span className="text-sm text-ink/70">{fileName || "Choose a CSV file…"}</span>
          <input type="file" accept=".csv" onChange={handleFile} className="hidden" />
        </label>

        {rows && (
          <p className="text-sm text-ink/70 mt-3">{rows.length} rows with a manager filled in, ready to import.</p>
        )}

        {error && <p className="text-sm text-rust-500 border-l-2 border-rust-500 pl-2.5 py-0.5 mt-3">{error}</p>}

        {result && (
          <div className="mt-3 text-sm">
            <p className="text-jade-600">Updated {result.updated} employees.</p>
            {result.not_found.length > 0 && (
              <p className="text-rust-500 mt-1">
                {result.not_found.length} code(s) not found: {result.not_found.slice(0, 10).join(", ")}
                {result.not_found.length > 10 ? "…" : ""}
              </p>
            )}
            {result.no_manager_email.length > 0 && (
              <p className="text-ochre-700 mt-1">
                {result.no_manager_email.length} manager(s) have no email on file, so their digest couldn't be wired up: {result.no_manager_email.slice(0, 10).join(", ")}
                {result.no_manager_email.length > 10 ? "…" : ""}
              </p>
            )}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-5">
          <button type="button" onClick={onClose} className="text-sm text-ink/70 hover:text-ink px-2">
            Cancel
          </button>
          <button
            disabled={!rows || !rows.length || busy}
            onClick={submit}
            className="bg-ledger-800 text-manila px-5 py-2.5 rounded-sm text-sm font-semibold hover:bg-ledger-700 disabled:opacity-50 transition-colors"
          >
            {busy ? "Importing…" : "Import"}
          </button>
        </div>
      </div>
    </div>
  );
}

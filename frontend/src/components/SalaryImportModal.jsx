import { Download, Upload, X } from "lucide-react";
import { useState } from "react";

import api from "../lib/api.js";
import { parseCsv } from "../lib/csv.js";

const TEMPLATE = "employee_code,basic,hra,conveyance,other_allowance\n14006,16000,9600,1200,0\n";

export default function SalaryImportModal({ onClose, onImported }) {
  const [rows, setRows] = useState(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    setError("");
    setResult(null);
    const text = await file.text();
    const parsed = parseCsv(text);
    if (!parsed.length || !("employee_code" in parsed[0])) {
      setError("CSV must have an 'employee_code' column (plus basic, hra, conveyance, other_allowance).");
      setRows(null);
      return;
    }
    setRows(parsed);
  };

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const payload = {
        rows: rows.map((r) => ({
          employee_code: r.employee_code,
          basic: Number(r.basic) || 0,
          hra: Number(r.hra) || 0,
          conveyance: Number(r.conveyance) || 0,
          other_allowance: Number(r.other_allowance) || 0,
        })),
      };
      const { data } = await api.post("/api/employees/bulk-salary", payload);
      setResult(data);
      if (data.not_found.length === 0) {
        setTimeout(onImported, 1200);
      }
    } catch (err) {
      setError(err.response?.data?.detail || "Import failed — check the file and try again");
    } finally {
      setBusy(false);
    }
  };

  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "jade-hr-salary-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 bg-ledger-900/60 flex items-center justify-center px-4 z-50">
      <div className="bg-paper rounded-sm shadow-stamp w-full max-w-lg p-6 border-t-4 border-jade-500 relative">
        <button onClick={onClose} aria-label="Close" className="absolute top-4 right-4 text-ink/70 hover:text-ink transition-colors">
          <X size={18} />
        </button>
        <p className="text-xs font-semibold uppercase tracking-wider text-jade-600 mb-1">Bulk import</p>
        <p className="font-display text-lg text-ink mb-1">Salary structure</p>
        <p className="text-xs text-ink/70 mb-5">
          CSV columns: employee_code, basic, hra, conveyance, other_allowance.{" "}
          <button onClick={downloadTemplate} className="text-jade-600 hover:underline inline-flex items-center gap-1">
            <Download size={11} /> Download template
          </button>
        </p>

        <label className="flex items-center gap-3 border border-dashed border-ink/25 rounded-sm px-4 py-4 cursor-pointer hover:border-jade-500 transition-colors">
          <Upload size={18} className="text-ink/70" />
          <span className="text-sm text-ink/70">{fileName || "Choose a CSV file…"}</span>
          <input type="file" accept=".csv" onChange={handleFile} className="hidden" />
        </label>

        {rows && (
          <p className="text-sm text-ink/70 mt-3">{rows.length} rows ready to import.</p>
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
          </div>
        )}

        <div className="flex justify-end gap-3 pt-5">
          <button type="button" onClick={onClose} className="text-sm text-ink/70 hover:text-ink px-2">
            Cancel
          </button>
          <button
            disabled={!rows || busy}
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

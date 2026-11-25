import { Fragment } from "react";

// Curly quotes: "x" -> "x", don't -> don’t, 'x' -> ‘x’. Applied to prose,
// never to values (names, codes, data) where the characters are meaningful.
export function curly(text) {
  if (typeof text !== "string") return text;
  return text
    .replace(/(^|[\s(\[{\u2014\u2013-])"/g, "$1\u201C")
    .replace(/"/g, "\u201D")
    .replace(/(^|[\s(\[{\u2014\u2013-])'/g, "$1\u2018")
    .replace(/'/g, "\u2019");
}

export const ACRONYMS = ["PF", "ESIC", "TDS", "OT", "LOP", "WFH", "CTC", "KYC", "UAN", "PAN", "IFSC", "GST", "PT", "LWF", "IST", "PDF", "HR", "KPI", "SLA", "FNF", "NDA", "OTP", "SMS", "API"];
const ACR_RE = new RegExp(`\\b(${ACRONYMS.join("|")})\\b`, "g");

// Wraps acronyms in <abbr class="acr"> so they render as small caps.
export function smallCaps(text) {
  if (typeof text !== "string") return text;
  const parts = text.split(ACR_RE);
  if (parts.length === 1) return text;
  return parts.map((p, i) => (i % 2 ? <abbr key={i} className="acr">{p}</abbr> : <Fragment key={i}>{p}</Fragment>));
}

// Prose helper: curly quotes + small-cap acronyms.
export function typo(text) {
  return smallCaps(curly(text));
}
export default function Typo({ children }) {
  return <>{typeof children === "string" ? typo(children) : children}</>;
}

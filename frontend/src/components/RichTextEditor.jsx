import { Bold, Heading2, Italic, List, ListOrdered, Underline } from "lucide-react";
import { useEffect, useRef } from "react";

// Minimal contentEditable-based rich text editor — no external dependency,
// just enough formatting (bold/italic/underline/lists/heading) for short
// policy notices/amendments. `value`/`onChange` carry HTML, not a JSON doc.
const COMMANDS = [
  { cmd: "bold", icon: Bold, label: "Bold" },
  { cmd: "italic", icon: Italic, label: "Italic" },
  { cmd: "underline", icon: Underline, label: "Underline" },
  { cmd: "insertUnorderedList", icon: List, label: "Bullet list" },
  { cmd: "insertOrderedList", icon: ListOrdered, label: "Numbered list" },
];

export default function RichTextEditor({ value, onChange, placeholder = "" }) {
  const ref = useRef(null);
  const lastValue = useRef(value);

  // Only pushes `value` into the DOM when it changed from OUTSIDE this editor
  // (e.g. loading a different notice) — never while the user is actively
  // typing in it, which would fight the browser's own cursor position.
  useEffect(() => {
    if (ref.current && value !== lastValue.current && document.activeElement !== ref.current) {
      ref.current.innerHTML = value || "";
      lastValue.current = value;
    }
  }, [value]);

  const handleInput = () => {
    const html = ref.current?.innerHTML ?? "";
    lastValue.current = html;
    onChange(html);
  };

  const exec = (cmd, arg = null) => {
    ref.current?.focus();
    document.execCommand(cmd, false, arg);
    handleInput();
  };

  return (
    <div className="border border-ink/15 rounded-sm bg-paper overflow-hidden">
      <div className="flex items-center gap-0.5 border-b border-ink/10 px-2 py-1.5 bg-manila/30">
        {COMMANDS.map(({ cmd, icon: Icon, label }) => (
          <button
            key={cmd}
            type="button"
            title={label}
            aria-label={label}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec(cmd)}
            className="p-1.5 rounded-sm text-ink/70 hover:bg-manila/60 hover:text-ink transition-colors"
          >
            <Icon size={14} />
          </button>
        ))}
        <button
          type="button"
          title="Heading"
          aria-label="Heading"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("formatBlock", "h4")}
          className="p-1.5 rounded-sm text-ink/70 hover:bg-manila/60 hover:text-ink transition-colors"
        >
          <Heading2 size={14} />
        </button>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        aria-label={placeholder}
        className="min-h-[120px] px-3 py-2.5 text-sm text-ink focus:outline-none [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_h4]:font-display [&_h4]:text-base [&_h4]:mt-1 [&_h4]:mb-1"
      />
    </div>
  );
}

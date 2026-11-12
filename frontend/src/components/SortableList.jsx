import { ChevronDown, ChevronUp, GripVertical } from "lucide-react";
import { useState } from "react";

// A drag-and-drop ordered list with no dependencies.
//   - Drag the grip handle to move an item; a green line shows where it will land.
//   - Keyboard: focus the grip and press Arrow Up / Arrow Down.
//   - Touch screens cannot drag with the browser's drag API, so small up/down buttons are shown too.
// `onReorder(nextItems)` receives the whole list in its new order; the caller saves it.
// `renderItem(item, index, handle)` draws one row; place `handle` wherever the grip should sit.
export default function SortableList({ items, getKey, onReorder, renderItem, as: Tag = "ul", className = "", itemClassName = "", arrows = true }) {
  const [armed, setArmed] = useState(null); // key whose handle is pressed: only then may the row start dragging
  const [dragging, setDragging] = useState(null);
  const [over, setOver] = useState(null); // { key, after }

  const move = (from, to) => {
    if (from === to || from < 0 || to < 0 || to >= items.length) return;
    const next = [...items];
    const [picked] = next.splice(from, 1);
    next.splice(to, 0, picked);
    onReorder(next);
  };
  const reset = () => { setArmed(null); setDragging(null); setOver(null); };

  return (
    <Tag className={className}>
      {items.map((item, i) => {
        const key = getKey(item);
        const isOver = over && over.key === key && dragging !== key;
        const handle = (
          <span className="inline-flex items-center gap-0.5 flex-shrink-0 text-ink/40">
            <button
              type="button" aria-label="Drag to reorder (or press arrow up or down)" title="Drag to reorder"
              onMouseDown={() => setArmed(key)} onMouseUp={() => setArmed(null)}
              onKeyDown={(e) => {
                if (e.key === "ArrowUp") { e.preventDefault(); move(i, i - 1); }
                if (e.key === "ArrowDown") { e.preventDefault(); move(i, i + 1); }
              }}
              className="cursor-grab active:cursor-grabbing p-0.5 rounded-sm hover:text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
            >
              <GripVertical size={16} />
            </button>
            {arrows && (
              <span className="flex flex-col -my-1">
                <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label="Move up" className="leading-none hover:text-ink disabled:opacity-20"><ChevronUp size={12} /></button>
                <button type="button" onClick={() => move(i, i + 1)} disabled={i === items.length - 1} aria-label="Move down" className="leading-none hover:text-ink disabled:opacity-20"><ChevronDown size={12} /></button>
              </span>
            )}
          </span>
        );
        return (
          <li
            key={key}
            draggable={armed === key}
            onDragStart={(e) => { setDragging(key); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(key)); }}
            onDragOver={(e) => {
              if (dragging === null) return;
              e.preventDefault();
              const r = e.currentTarget.getBoundingClientRect();
              setOver({ key, after: e.clientY > r.top + r.height / 2 });
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragging !== null && over) {
                const from = items.findIndex((x) => getKey(x) === dragging);
                let to = items.findIndex((x) => getKey(x) === over.key) + (over.after ? 1 : 0);
                if (from < to) to -= 1;
                move(from, to);
              }
              reset();
            }}
            onDragEnd={reset}
            className={`${itemClassName} ${dragging === key ? "opacity-40" : ""} ${isOver ? (over.after ? "shadow-[0_2px_0_0_#16a34a]" : "shadow-[0_-2px_0_0_#16a34a]") : ""}`}
          >
            {renderItem(item, i, handle)}
          </li>
        );
      })}
    </Tag>
  );
}

import { useState, type KeyboardEvent, type ReactNode } from "react";
import { cardLabel } from "./card-label.js";
import { checkDiagramSource } from "./diagram-source.js";
import { applyViewAction, fitView, viewStyle, type DiagramGeometry, type ViewAction } from "./diagram-view.js";

type PomeloDiagramCardProps = DiagramGeometry & {
  source: unknown;
  title?: string;
  drawn?: ReactNode;
  reducedMotion?: boolean;
};

const diagramKeys = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "+", "-", "0"]);
const controls = [
  { label: "Zoom in", type: "zoom-in" },
  { label: "Zoom out", type: "zoom-out" },
  { label: "Fit", type: "reset" },
] as const;

export function diagramKeyAction(key: string, shiftKey = false): ViewAction | null {
  if (!diagramKeys.has(key)) return null;
  return shiftKey ? { type: "key", key, shiftKey } : { type: "key", key };
}

export function PomeloDiagramCard({ source, title, drawn, frame, diagram, reducedMotion }: PomeloDiagramCardProps) {
  const check = checkDiagramSource(source);
  const geometry = { frame, diagram };
  const [view, setView] = useState(() => fitView(geometry));

  function dispatch(action: ViewAction) {
    setView((current) => applyViewAction(current, action, geometry));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey) return;
    const action = diagramKeyAction(event.key, event.shiftKey);
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    dispatch(action);
  }

  const { label: zoomLabel, ...drawingStyle } = viewStyle(view, { reducedMotion });
  return (
    <figure
      className="m-0 min-w-0 rounded-xl border p-3"
      style={{ backgroundColor: "var(--card)", color: "var(--ink)", borderColor: "var(--border)" }}
    >
      {title && <figcaption dir="auto" className="mb-2 font-medium">{title}</figcaption>}
      {!check.ok || drawn == null || typeof drawn === "boolean" ? (
        <>
          <p dir="ltr" className="mb-2 text-sm" style={{ color: "var(--ink-2)" }}>
            {check.ok ? "The diagram has not been drawn yet." : check.reason}
          </p>
          <pre dir="ltr" tabIndex={0} className="m-0 overflow-x-auto whitespace-pre text-left">{check.ok ? check.source : check.fallbackText}</pre>
        </>
      ) : (
        <>
          <div className="overflow-x-auto p-1">
            <div
              role="img"
              aria-label={cardLabel({ kind: "diagram", title }).label}
              dir={check.dir}
              tabIndex={0}
              onKeyDown={handleKeyDown}
              className="relative overflow-hidden focus-visible:outline-2"
              style={{ width: frame.width, height: frame.height }}
            >
              <div className="absolute top-0 left-0" style={{ width: diagram.width, height: diagram.height, ...drawingStyle }}>
                {drawn}
              </div>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {controls.map(({ label, type }) => (
              <button
                key={type}
                type="button"
                className="min-h-9 rounded-lg border px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{ borderColor: "var(--border)" }}
                onClick={() => dispatch({ type })}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="sr-only" role="status">{zoomLabel}</p>
        </>
      )}
    </figure>
  );
}

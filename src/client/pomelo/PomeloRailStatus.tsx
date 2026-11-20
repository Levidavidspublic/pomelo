import type { RailStateView } from "./rail-state.js";
import { textDirection } from "./text-direction.js";

export interface PomeloRailStatusProps {
  view: RailStateView;
  onRetry: () => void;
  loadingText?: string;
}

export function PomeloRailStatus({ view, onRetry, loadingText = "Loading threads" }: PomeloRailStatusProps) {
  if (view.kind === "ready" || view.kind === "refreshing") return null;

  const loading = view.kind === "first-load";
  const text = loading ? loadingText : view.note ?? "";

  return (
    <div
      role="status"
      dir={textDirection(text)}
      aria-busy={loading || undefined}
      className="flex flex-wrap items-center gap-2 px-2 py-1 text-xs text-muted-foreground"
    >
      <p>{text}</p>
      {view.canRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="cursor-pointer rounded-md bg-secondary px-2 py-1 font-medium text-secondary-foreground hover:bg-secondary/80 focus-visible:ring-2 focus-visible:ring-ring"
        >
          Try again
        </button>
      )}
    </div>
  );
}

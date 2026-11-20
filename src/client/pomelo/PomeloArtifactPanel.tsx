import { ArtifactFrame } from "./ArtifactFrame.js";
import type { ArtifactPanelState } from "./artifact-state.js";

interface PomeloArtifactPanelProps {
  state: ArtifactPanelState;
  /** Body and title for the version in state.shown. */
  html?: string;
  title?: string;
  onRetry: () => void;
}

export function PomeloArtifactPanel({ state, html, title = "", onRetry }: PomeloArtifactPanelProps) {
  const waitingForBody = state.kind === "ready" && !html;
  const status = state.kind === "ready" ? state.note : state.label;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <p className="sr-only" aria-live="polite" aria-atomic="true" aria-busy={waitingForBody || undefined}>
        {state.screenReaderLine}
      </p>
      {(waitingForBody || status || state.canRetry) && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 px-3 py-2">
          {waitingForBody && <p className="text-sm text-[var(--text-muted)]">Loading artifact</p>}
          {status && <p className="text-sm text-[var(--text-muted)]">{status}</p>}
          {state.canRetry && (
            <button
              type="button"
              className="min-h-8 cursor-pointer rounded-md border border-[var(--border)] px-2 text-sm text-[var(--ink)] hover:bg-[var(--hover)] focus-visible:ring-2 focus-visible:ring-ring"
              onClick={onRetry}
            >
              Try again
            </button>
          )}
        </div>
      )}
      <div aria-busy={state.busy || waitingForBody} className="flex min-h-0 flex-1 flex-col [&>iframe]:flex-1">
        {state.shown && html && <ArtifactFrame html={html} title={title} />}
      </div>
    </div>
  );
}

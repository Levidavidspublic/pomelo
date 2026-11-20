export interface ArtifactSelection {
  readonly artifactId: string;
  readonly version: number;
}

export type ArtifactPanelEvent =
  | ({ type: "open" | "loaded" | "not_found" | "archived" | "too_big" | "failed" } & ArtifactSelection)
  | { type: "retry" | "close" };

interface PanelStatus {
  readonly label: string;
  readonly screenReaderLine: string;
  readonly busy: boolean;
  readonly canRetry: boolean;
  readonly note?: string;
}

export type ArtifactPanelState = PanelStatus & (
  | { readonly kind: "idle"; readonly requested: null; readonly shown: null }
  | { readonly kind: "loading"; readonly requested: ArtifactSelection; readonly shown: ArtifactSelection | null }
  | { readonly kind: "ready"; readonly requested: ArtifactSelection; readonly shown: ArtifactSelection }
  | { readonly kind: "missing" | "put_away" | "too_big" | "failed"; readonly requested: ArtifactSelection; readonly shown: null }
);

export const ARTIFACT_PANEL_IDLE: ArtifactPanelState = Object.freeze({
  kind: "idle",
  requested: null,
  shown: null,
  label: "No artifact open",
  screenReaderLine: "No artifact is open.",
  busy: false,
  canRetry: false,
});

const unavailable = {
  not_found: { kind: "missing", label: "Artifact not found", screenReaderLine: "This artifact could not be found." },
  archived: { kind: "put_away", label: "Artifact put away", screenReaderLine: "This artifact was put away." },
  too_big: { kind: "too_big", label: "Artifact is too large to show", screenReaderLine: "This artifact is too large to show in the panel." },
} as const;

function loading(requested: ArtifactSelection, shown: ArtifactSelection | null): ArtifactPanelState {
  return {
    kind: "loading",
    requested,
    shown,
    label: "Loading artifact",
    screenReaderLine: shown ? "Loading the artifact. The open version is still shown." : "Loading the artifact.",
    busy: true,
    canRetry: false,
  };
}

export function artifactPanelReduce(state: ArtifactPanelState, event: ArtifactPanelEvent): ArtifactPanelState {
  switch (event.type) {
    case "open": {
      const { artifactId, version } = event;
      const shown = state.shown?.artifactId === artifactId ? state.shown : null;
      return loading({ artifactId, version }, shown);
    }
    case "retry":
      return state.canRetry && state.requested ? loading(state.requested, state.shown) : state;
    case "close":
      return ARTIFACT_PANEL_IDLE;
  }

  const { requested, shown } = state;
  if (!requested || event.artifactId !== requested.artifactId || event.version !== requested.version) return state;
  if (state.kind !== "loading" && !(state.kind === "ready" && event.type === "failed")) return state;

  switch (event.type) {
    case "loaded":
      return {
        kind: "ready",
        requested,
        shown: requested,
        label: "Artifact ready",
        screenReaderLine: "The artifact is ready.",
        busy: false,
        canRetry: false,
      };
    case "not_found":
    case "archived":
    case "too_big":
      return { ...unavailable[event.type], requested, shown: null, busy: false, canRetry: false };
    case "failed":
      if (shown) {
        const note = "Could not refresh. The open version is still shown.";
        return {
          kind: "ready",
          requested,
          shown,
          label: "Artifact ready",
          note,
          screenReaderLine: `${note} You can retry.`,
          busy: false,
          canRetry: true,
        };
      }
      return {
        kind: "failed",
        requested,
        shown: null,
        label: "Could not load artifact",
        screenReaderLine: "Could not load the artifact. You can retry.",
        busy: false,
        canRetry: true,
      };
    default:
      return state;
  }
}

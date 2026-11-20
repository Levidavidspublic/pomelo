import type { Artifact } from "../../pomelo/artifact.js";
import type { PomeloCard } from "../../pomelo/rich-cards.js";
import type { PanelAction } from "./artifact-panel.js";
import { cardLabel } from "./card-label.js";

const kindWords = {
  html: "HTML page",
  mermaid: "Diagram",
  chart: "Chart",
  image: "Image",
  artifact: "HTML page",
  diagram: "Diagram",
} as const;

type ArtifactCard = Pick<PomeloCard, "title" | "version"> & Pick<Artifact, "id"> & {
  kind: Artifact["kind"] | Extract<PomeloCard["kind"], "artifact" | "diagram">;
};
type OpenPayload = Pick<Extract<PanelAction, { type: "open" }>, "artifactId" | "version">;

type PomeloArtifactCardProps = {
  card: ArtifactCard;
  archived?: boolean;
  onOpen: (payload: OpenPayload) => void;
};

export function artifactOpenPayload({ id, version }: { id?: unknown; version?: unknown }): OpenPayload | null {
  if (typeof id !== "string" || !id || /[^\w-]/.test(id)) return null;
  if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 1) return null;
  return { artifactId: id, version };
}

export function PomeloArtifactCard({ card, archived = false, onOpen }: PomeloArtifactCardProps) {
  const { title, version } = card;
  const spoken = cardLabel({ kind: "artifact", title, version });
  const kind = kindWords[card.kind];
  const versionSuffix = Number.isSafeInteger(version) && version > 0 ? `, version ${version}` : "";
  const hasTitle = spoken.label !== spoken.kind;
  const safeTitle = hasTitle ? spoken.label.slice(spoken.kind.length + 2, spoken.label.length - versionSuffix.length) : kind;
  const payload = artifactOpenPayload(card);
  const disabled = archived || !payload;

  return (
    <div role="group" className="flex items-center gap-2 rounded-lg border bg-background px-3 py-1 text-sm">
      <span dir={spoken.dir} className="flex min-w-0 flex-1 whitespace-pre">
        <span className="shrink-0">{hasTitle ? `${kind}: ` : kind}</span>
        {hasTitle && <span className="min-w-0 truncate">{safeTitle}</span>}
        {versionSuffix && <span className="shrink-0">{versionSuffix}</span>}
      </span>
      {archived && <span className="shrink-0 text-muted-foreground">Put away</span>}
      <button
        type="button"
        aria-label={`Open ${safeTitle}`}
        aria-disabled={disabled || undefined}
        disabled={disabled}
        className="min-h-8 shrink-0 rounded-md px-2 py-1 font-medium enabled:hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:text-muted-foreground"
        onClick={() => {
          if (!archived && payload) onOpen(payload);
        }}
      >
        Open
      </button>
    </div>
  );
}

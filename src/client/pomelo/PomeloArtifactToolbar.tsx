import { Button } from "../components/ui/button.js";
import { artifactToolbar, type ToolbarKind } from "./artifact-toolbar.js";

interface PomeloArtifactToolbarProps {
  kind: ToolbarKind;
  title: string;
  version: number;
  latest: number;
  onCopy: () => void;
  onDownload: (fileName: string, mime: string) => void;
  onOpenInWindow: () => void;
  onPickVersion: (version: number) => void;
}

export function PomeloArtifactToolbar({
  kind, title, version, latest, onCopy, onDownload, onOpenInWindow, onPickVersion,
}: PomeloArtifactToolbarProps) {
  const { copy, download, openInWindow, versions } = artifactToolbar({ kind, title, version, latest });
  const current = versions.find((entry) => entry.current);

  return (
    <div role="toolbar" aria-label="Artifact actions" className="flex shrink-0 flex-wrap items-center gap-2 px-3 py-2">
      <Button type="button" variant="outline" disabled={!copy.enabled} onClick={copy.enabled ? onCopy : undefined}>
        {copy.label}
      </Button>
      <Button
        type="button"
        variant="outline"
        aria-label={`Download ${download.fileName}`}
        className="h-auto min-h-8 min-w-0 max-w-full shrink whitespace-normal"
        onClick={() => onDownload(download.fileName, download.mime)}
      >
        Download <bdi className="min-w-0 break-all text-start">{download.fileName}</bdi>
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={!openInWindow.enabled}
        className="h-auto min-h-8 max-w-full shrink flex-wrap whitespace-normal disabled:text-[var(--text-muted)] disabled:opacity-100"
        onClick={openInWindow.enabled ? onOpenInWindow : undefined}
      >
        Open in window{!openInWindow.enabled && <span> (Unavailable for this artifact)</span>}
      </Button>
      {versions.length > 1 && (
        <label className="flex items-center gap-2 text-sm">
          Version
          <select
            className="min-h-8 rounded-md border border-[var(--border)] bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring"
            value={current?.version}
            onChange={(event) => onPickVersion(Number(event.currentTarget.value))}
          >
            {versions.map((entry) => (
              <option key={entry.version} value={entry.version}>
                {entry.label}{entry.latest ? " (latest)" : ""}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

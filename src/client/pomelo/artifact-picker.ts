import { textDirection } from "./text-direction.js";

const kindLabels = {
  html: "HTML page",
  mermaid: "Diagram",
  chart: "Chart",
  image: "Image",
};

type ArtifactListRow = {
  artifactId: string;
  kind: keyof typeof kindLabels;
  title: string;
  version: number;
  versionCount: number;
  updatedAt: number;
};

type PickerInputRow = Partial<Record<keyof ArtifactListRow, unknown>> & { artifactId: string };

const MAX_ROWS = 50;
const EMPTY_NOTE = "No artifacts in this thread yet";

function collectRows(input: unknown, openId: unknown) {
  const seen = new Set<string>();
  const rows: PickerInputRow[] = [];
  if (Array.isArray(input)) {
    for (const value of input) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const { artifactId, kind, title, version } = value as Partial<Record<keyof ArtifactListRow, unknown>>;
      if (typeof artifactId !== "string" || !artifactId.trim() || seen.has(artifactId)) continue;

      seen.add(artifactId);
      if (rows.length < MAX_ROWS) rows.push({ artifactId, kind, title, version });
    }
  }

  const match = rows.findIndex(({ artifactId }) => artifactId === openId);
  return {
    rows,
    openIndex: Math.max(0, match),
    fellBack: rows.length > 0 && match < 0 && openId != null,
    moreCount: seen.size - rows.length,
  };
}

export function artifactPicker(input: unknown, openId: unknown) {
  const { rows, openIndex, fellBack, moreCount } = collectRows(input, openId);
  const pickerRows = rows.map(({ artifactId, kind, title, version }, index) => {
    const kindLabel = typeof kind === "string" && Object.hasOwn(kindLabels, kind)
      ? kindLabels[kind as ArtifactListRow["kind"]]
      : "Artifact";
    const displayTitle = (typeof title === "string" && title.trim()) || kindLabel;
    const versionNumber = typeof version === "number" && Number.isSafeInteger(version) && version > 0 ? version : 1;
    return {
      artifactId,
      title: displayTitle,
      kindLabel,
      versionLabel: `Version ${versionNumber}`,
      dir: textDirection(displayTitle),
      open: index === openIndex,
    };
  });

  const selected = pickerRows[openIndex];
  const shown = pickerRows.length > 1;
  return {
    shown,
    rows: pickerRows,
    note: shown ? null : selected ? "Only one artifact in this thread" : EMPTY_NOTE,
    summary: selected
      ? `Artifact ${openIndex + 1} of ${pickerRows.length + moreCount}: ${selected.title}, ${selected.versionLabel}`
      : EMPTY_NOTE,
    fellBack,
    moreCount,
  };
}

export function pickerKey(input: unknown, openId: unknown, keyOrEvent: unknown): string | null {
  let key = keyOrEvent;
  if (keyOrEvent && typeof keyOrEvent === "object") {
    const event = keyOrEvent as { key?: unknown; isComposing?: unknown };
    if (event.isComposing === true) return null;
    key = event.key;
  }
  if (key !== "ArrowDown" && key !== "ArrowUp" && key !== "Home" && key !== "End") return null;

  const { rows, openIndex } = collectRows(input, openId);
  switch (key) {
    case "ArrowDown": return (rows[openIndex + 1] ?? rows[openIndex])?.artifactId ?? null;
    case "ArrowUp": return (rows[openIndex - 1] ?? rows[openIndex])?.artifactId ?? null;
    case "Home": return rows[0]?.artifactId ?? null;
    case "End": return rows[rows.length - 1]?.artifactId ?? null;
  }
}

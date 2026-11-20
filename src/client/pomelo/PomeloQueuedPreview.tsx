import type { previewRows } from "./queued-preview.js";

export type PreviewRow = ReturnType<typeof previewRows>[number];

export interface PomeloQueuedPreviewProps {
  rows: readonly PreviewRow[];
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
}

const buttonClassName = "shrink-0 cursor-pointer rounded-md bg-secondary px-2 py-1 font-medium text-secondary-foreground hover:bg-secondary/80 focus-visible:ring-2 focus-visible:ring-ring";

export function PomeloQueuedPreview({ rows, onEdit, onRemove }: PomeloQueuedPreviewProps) {
  if (rows.length === 0) return null;

  return (
    <ul role="list" aria-label="Queued messages" className="flex flex-col gap-1">
      {rows.map((row) => (
        <li key={row.id} className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-card px-2 py-1 text-xs text-card-foreground">
          <bdi dir={row.direction} className="min-w-0 flex-1 truncate text-start">{row.text}</bdi>
          {row.attachmentCount > 0 && (
            <span className="shrink-0 whitespace-nowrap text-muted-foreground">
              {row.attachmentCount} {row.attachmentCount === 1 ? "attachment" : "attachments"}
            </span>
          )}
          <button
            type="button"
            aria-label={`Edit ${row.label}`}
            className={buttonClassName}
            onClick={() => onEdit(row.id)}
          >
            Edit
          </button>
          <button
            type="button"
            aria-label={`Remove ${row.label}`}
            className={buttonClassName}
            onClick={() => onRemove(row.id)}
          >
            Remove
          </button>
        </li>
      ))}
    </ul>
  );
}

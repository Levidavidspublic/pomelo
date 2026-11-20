import type { JobStepRow } from "./job-steps.js";

export function PomeloJobSteps({ rows }: { rows: readonly JobStepRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-[var(--text-muted)]">No steps yet</p>;
  }

  return (
    <ol dir="auto" role="list" className="space-y-2 text-sm">
      {rows.map((row) => (
        <li key={row.id} className="flex flex-col gap-1 rounded-md border border-[var(--border)] p-2">
          <span dir="auto" className="break-words">{row.label}</span>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--text-muted)]">
            <span>{row.state}</span>
            <span>{row.timeLabel}</span>
            {row.masked && <span className="rounded-md border border-[var(--border)] px-1.5">masked</span>}
            {row.needsAmit && <span className="rounded-md border border-[var(--border)] px-1.5 font-medium">needs you</span>}
          </div>
        </li>
      ))}
    </ol>
  );
}

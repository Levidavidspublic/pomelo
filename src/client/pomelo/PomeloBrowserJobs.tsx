import { browserPanel, type PanelJob, type PanelProfile } from "./browser-panel.js";

export function PomeloBrowserJobs({ threadId, jobs, profiles, maskOff, onPickJob }: {
  threadId: string;
  jobs: readonly PanelJob[];
  profiles: readonly PanelProfile[];
  maskOff?: boolean;
  onPickJob: (jobId: string) => void;
}) {
  const { rows, activeJobId, masked, vps } = browserPanel({ threadId, jobs, profiles, maskOff });

  return (
    <div className="space-y-2 text-sm">
      <p className="flex flex-wrap gap-2 text-xs text-[var(--text-muted)]">
        <span className="rounded-md border border-[var(--border)] px-1.5">
          {masked ? "Masked" : "Masking off for this job"}
        </span>
        {vps && <span className="rounded-md border border-[var(--border)] px-1.5">Runs on the VPS</span>}
      </p>
      {rows.length === 0 ? (
        <p className="text-[var(--text-muted)]">No browser jobs in this thread yet.</p>
      ) : (
        <ul role="list" className="space-y-2">
          {rows.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                aria-current={row.id === activeJobId || undefined}
                onClick={() => onPickJob(row.id)}
                className="flex w-full cursor-pointer flex-col gap-1 rounded-md border border-[var(--border)] p-2 text-start hover:bg-[var(--hover)] focus-visible:shadow-[var(--focus-ring)] aria-[current=true]:border-[var(--border-strong)] aria-[current=true]:bg-[var(--hover)]"
              >
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--text-muted)]">
                  <span className="text-sm font-medium text-[var(--ink)]">{row.label}</span>
                  <span className="min-w-0 break-words" dir="auto">{row.state}</span>
                  <span className="min-w-0 break-words" dir="auto">{row.profileName}</span>
                  {row.vps && <span className="rounded-md border border-[var(--border)] px-1.5">VPS</span>}
                </span>
                {row.lastStep && <span className="break-words text-[var(--ink-2)]" dir="auto">{row.lastStep}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

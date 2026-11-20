import { useId } from "react";
import {
  pomeloWorkPanel,
  type LaneLike,
  type ToolCallLike,
  type WorkPanelCallState,
  type WorkPanelLaneState,
} from "./work-panel.js";

const stateLabels: Record<WorkPanelLaneState | WorkPanelCallState, string> = {
  running: "Running",
  waiting: "Waiting",
  stuck: "Stuck",
  failed: "Failed",
  done: "Done",
};

export function PomeloWorkPanel({ lanes, calls }: { lanes: readonly LaneLike[]; calls: readonly ToolCallLike[] }) {
  const panelId = useId();
  const rows = pomeloWorkPanel(lanes, calls);

  if (rows.length === 0) {
    return <p className="m-0 p-3 text-sm text-foreground" dir="auto">No agents are working in this thread yet.</p>;
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {rows.map((row, index) => {
        const headingId = `${panelId}-lane-${index}`;
        return (
          <section
            key={row.laneId}
            aria-labelledby={headingId}
            className="flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-card p-3 text-card-foreground"
          >
            <h2 id={headingId} className="m-0 text-start text-sm font-semibold [overflow-wrap:anywhere]" dir="auto">{row.name}</h2>
            <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
              <dt>Driver</dt>
              <dd className="m-0 text-start" dir="auto">{row.driver}</dd>
              <dt>Model</dt>
              <dd className="m-0 text-start [overflow-wrap:anywhere]" dir="auto">{row.model}</dd>
              <dt>State</dt>
              <dd className="m-0 text-start" dir="auto">{stateLabels[row.state]}</dd>
            </dl>
            {row.calls.length > 0 && (
              <ul className="m-0 list-none space-y-1 border-t border-border p-0 pt-2 text-sm" role="list" aria-label="Tool calls">
                {row.calls.map((call) => (
                  <li key={call.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
                    <bdi className="[overflow-wrap:anywhere]">{call.tool}</bdi>
                    <span>{stateLabels[call.state]}</span>
                  </li>
                ))}
              </ul>
            )}
            {row.moreCalls > 0 && <p className="m-0 text-start text-sm" dir="auto">+{row.moreCalls} more calls</p>}
          </section>
        );
      })}
    </div>
  );
}

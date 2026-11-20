import { TaskMark } from "../TaskMark.js";
import { pomeloSubagentRows, pomeloSubagentTally, type LaneLike } from "./subagent-rows.js";

export function PomeloSubagents({ lanes, threadId }: { lanes: readonly LaneLike[]; threadId: string }) {
  const rows = pomeloSubagentRows(lanes, threadId);
  if (rows.length === 0) return null;

  const { text } = pomeloSubagentTally(rows);
  return (
    <section className="subs pomelo-subagents">
      <style href="pomelo-subagents" precedence="default">{`
        .pomelo-subagents .sub-mark > .ring-spin { animation: none; }
        .pomelo-subagents .sub:dir(rtl) { padding-inline: 16px 14px; }
        .pomelo-subagents .sub:dir(rtl)::before { left: auto; right: 22px; }
      `}</style>
      <header className="subs-head">
        <span className="subs-title">Sub-agents</span>
        <span className="subs-state">{text}</span>
      </header>
      <ol className="subs-list" role="list" aria-label="Sub-agents">
        {rows.map((row) => (
          <li key={row.id} className="sub" dir="auto" data-state={row.status} data-tone={row.tone === "bad" ? "bad" : undefined}>
            <span className="sub-mark"><TaskMark state={row.status} /></span>
            <div className="sub-body">
              <div className="sub-line">
                <span className="sub-name">{row.title}</span>
                <span className="sub-type">Spawned by <bdi>{row.by}</bdi></span>
                <span className="sr-only">{row.status}</span>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export type ThreadMenuInput = {
  archived: boolean;
  runningLanes: number;
  openedBy?: string;
  hasParent: boolean;
  isSubagentLane: boolean;
  busy: boolean;
};

export type ThreadMenuItem = {
  id: "retag" | "copy-link" | "open-parent" | "archive" | "unarchive" | "stop-subagents";
  label: string;
  enabled: boolean;
  reason?: string;
  danger: boolean;
};

export function threadMenu(input: ThreadMenuInput): ThreadMenuItem[] {
  const { archived, runningLanes, hasParent, isSubagentLane, busy } = input;
  const threadChange = busy ? { enabled: false, reason: "This thread is busy." } : { enabled: true };
  const retag = isSubagentLane
    ? { enabled: false, reason: "Sub-agent lanes cannot be retagged." }
    : threadChange;

  const items: ThreadMenuItem[] = [
    { id: "retag", label: "Retag", danger: false, ...retag },
    { id: "copy-link", label: "Copy link", enabled: true, danger: false },
  ];
  if (hasParent) {
    items.push({ id: "open-parent", label: "Open parent thread", enabled: true, danger: false });
  }
  items.push({
    id: archived ? "unarchive" : "archive",
    label: archived ? "Bring back" : "Put away",
    danger: false,
    ...threadChange,
  });
  if (Number.isInteger(runningLanes) && runningLanes > 0) {
    const subagents = runningLanes === 1 ? "sub-agent" : "sub-agents";
    items.push({ id: "stop-subagents", label: `Stop ${runningLanes} ${subagents}`, enabled: true, danger: true });
  }
  return items;
}

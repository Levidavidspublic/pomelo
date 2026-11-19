type StopLane = {
  laneId: string;
  spawnedBy: string;
  status: "running" | "done" | "failed" | "cancelled";
  endedAt?: number;
};

type StopRequest = { kind: "lane"; laneId: string } | { kind: "thread" };

type LaneChange = {
  laneId: string;
  status: "cancelled";
  endedAt: number;
};

export function laneStop(
  lanes: readonly StopLane[],
  request: StopRequest,
  now: number,
): { changes: LaneChange[]; reason?: string } {
  const running = lanes.filter((lane) => lane.status === "running");
  let laneIds: string[];

  if (request.kind === "thread") {
    laneIds = running.map((lane) => lane.laneId);
  } else {
    const target = lanes.find((lane) => lane.laneId === request.laneId);
    if (!target) return { changes: [], reason: "Unknown lane." };
    if (target.status !== "running") return { changes: [], reason: "Lane already finished." };

    const childrenByParent = new Map<string, string[]>();
    for (const { laneId, spawnedBy } of running) {
      const children = childrenByParent.get(spawnedBy);
      if (children) children.push(laneId);
      else childrenByParent.set(spawnedBy, [laneId]);
    }

    laneIds = [target.laneId];
    const visited = new Set(laneIds);
    for (let index = 0; index < laneIds.length; index++) {
      for (const childId of childrenByParent.get(laneIds[index]) ?? []) {
        if (visited.has(childId)) continue;
        visited.add(childId);
        laneIds.push(childId);
      }
    }
  }

  return {
    changes: laneIds.sort().map((laneId) => ({ laneId, status: "cancelled", endedAt: now })),
  };
}

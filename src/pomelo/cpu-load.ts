export interface CpuLoadOptions {
  workersWanted?: number;
  perWorkerCores?: number;
  stopAbovePerCore?: number;
}

export interface CpuLoadResult {
  verdict: "go" | "fewer" | "stop";
  workersThatFit: number;
  loadPerCore: { oneMinute: number; fiveMinute: number } | null;
  reason: string;
}

/** Decide how many workers to start from supplied `/proc/loadavg` and `nproc` snapshots. */
export function cpuLoad(
  loadavgText: string,
  nprocText: string,
  { workersWanted = 1, perWorkerCores = 1, stopAbovePerCore = 2 }: CpuLoadOptions = {},
): CpuLoadResult {
  const unreadable: CpuLoadResult = { verdict: "stop", workersThatFit: 0, loadPerCore: null, reason: "unreadable" };
  const fields = loadavgText.trim().split(/[ \t]+/);
  const coreCount = nprocText.trim();
  const cores = Number(coreCount);
  if (fields.length !== 5 || !/^\d+\/\d+$/.test(fields[3]) || !/^\d+$/.test(fields[4]) ||
      !/^\d+$/.test(coreCount) || !Number.isSafeInteger(cores) || cores < 1) {
    return unreadable;
  }

  const loads = fields.slice(0, 3).map((field) => /^\d+(?:\.\d+)?$/.test(field) ? Number(field) : NaN);
  if (!loads.every(Number.isFinite)) return unreadable;

  const [oneMinuteLoad, fiveMinuteLoad] = loads;
  const loadPerCore = { oneMinute: oneMinuteLoad / cores, fiveMinute: fiveMinuteLoad / cores };
  if (!Number.isSafeInteger(workersWanted) || workersWanted < 0 ||
      !Number.isFinite(perWorkerCores) || perWorkerCores <= 0 ||
      !Number.isFinite(stopAbovePerCore) || stopAbovePerCore < 0) {
    return { verdict: "stop", workersThatFit: 0, loadPerCore, reason: "Invalid CPU load limits." };
  }
  if (workersWanted === 0) {
    return { verdict: "go", workersThatFit: 0, loadPerCore, reason: "No workers requested." };
  }
  if (loadPerCore.oneMinute > stopAbovePerCore && loadPerCore.fiveMinute > stopAbovePerCore) {
    return { verdict: "stop", workersThatFit: 0, loadPerCore, reason: "Both CPU load averages are above the stop limit." };
  }

  // A short spike can reduce capacity to one worker when the five-minute load still leaves room.
  const recentFreeCores = Math.max(perWorkerCores, cores - oneMinuteLoad);
  const sustainedFreeCores = cores - fiveMinuteLoad;
  const freeCores = Math.max(0, Math.min(recentFreeCores, sustainedFreeCores));
  const workersThatFit = Math.min(workersWanted, Math.floor(freeCores / perWorkerCores));
  if (workersThatFit === 0) {
    return { verdict: "stop", workersThatFit, loadPerCore, reason: "CPU capacity is too low for one worker." };
  }
  if (workersThatFit < workersWanted) {
    return { verdict: "fewer", workersThatFit, loadPerCore, reason: "CPU load limits how many workers can start." };
  }
  return { verdict: "go", workersThatFit, loadPerCore, reason: "There is CPU capacity for all requested workers." };
}

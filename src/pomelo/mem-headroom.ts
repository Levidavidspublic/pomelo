export interface MemHeadroomOptions {
  workersWanted?: number;
  perWorkerKb?: number;
  stopFloorKb?: number;
}

export interface MemHeadroomResult {
  verdict: "go" | "fewer" | "stop";
  workersThatFit: number;
  availableKb: number | null;
  reason: string;
}

function readKb(fields: string[], expectedFields: number): number[] | null {
  if (fields.length !== expectedFields) return null;
  const values = fields.map((field) => /^\d+$/.test(field) ? Number(field) : NaN);
  return values.every(Number.isSafeInteger) ? values : null;
}

/** Decide how many of the requested workers to start from an English `free -k` snapshot. */
export function memHeadroom(
  freeText: string,
  { workersWanted = 1, perWorkerKb = 2 * 1024 * 1024, stopFloorKb = 1024 * 1024 }: MemHeadroomOptions = {},
): MemHeadroomResult {
  const unreadable: MemHeadroomResult = { verdict: "stop", workersThatFit: 0, availableKb: null, reason: "unreadable" };
  const [columns, ...rows] = freeText.trim().split(/\r?\n/).map((line) => line.trim().split(/\s+/));
  const mem = rows.find(([label]) => label === "Mem:");
  if (!mem || !columns.includes("total") || !columns.includes("used") || !columns.includes("free")) return unreadable;

  const memory = readKb(mem.slice(1), columns.length);
  if (!memory) return unreadable;

  const availableIndex = columns.indexOf("available");
  let availableKb = memory[availableIndex];
  if (availableIndex === -1) {
    const freeKb = memory[columns.indexOf("free")];
    const combinedCacheKb = memory[columns.indexOf("buff/cache")];
    const buffersKb = memory[columns.indexOf("buffers")];
    const cachedKb = memory[columns.indexOf("cached")];
    availableKb = freeKb + (combinedCacheKb ?? (buffersKb + cachedKb));
  }
  if (!Number.isSafeInteger(availableKb)) return unreadable;

  const swapRow = rows.find(([label]) => label === "Swap:");
  const swap = swapRow ? readKb(swapRow.slice(1), 3) : null;
  if (swapRow && (!swap || swap[1] > swap[0])) return unreadable;

  if (![workersWanted, perWorkerKb, stopFloorKb].every(Number.isSafeInteger)
    || workersWanted < 1 || perWorkerKb < 1 || stopFloorKb < 0) {
    return { verdict: "stop", workersThatFit: 0, availableKb, reason: "Invalid memory limits." };
  }
  if (availableKb < stopFloorKb) {
    return { verdict: "stop", workersThatFit: 0, availableKb, reason: "Available memory is below the stop floor." };
  }

  const workersThatFit = Math.min(workersWanted, Math.floor(availableKb / perWorkerKb));
  if (workersThatFit === 0) {
    return { verdict: "stop", workersThatFit, availableKb, reason: "Available memory is too low for one worker." };
  }
  if (swap && swap[1] > swap[0] / 2) {
    const reducedWorkers = Math.min(workersThatFit, workersWanted - 1);
    return {
      verdict: reducedWorkers === 0 ? "stop" : "fewer",
      workersThatFit: reducedWorkers,
      availableKb,
      reason: "More than half of swap is in use.",
    };
  }
  if (workersThatFit < workersWanted) {
    return { verdict: "fewer", workersThatFit, availableKb, reason: "Available memory only fits some of the requested workers." };
  }
  return { verdict: "go", workersThatFit, availableKb, reason: "Available memory fits all requested workers." };
}

export type PortUseVerdict = "go" | "cleanup" | "stop" | "unreadable";

export interface PortUseOptions {
  need: readonly number[];
  mayStop: readonly string[];
  protect: readonly string[];
  protectPids: readonly number[];
}

export interface TakenPort {
  port: number;
  /** Both owner fields are null when ss omits process details. */
  program: string | null;
  pid: number | null;
  action: "cleanup" | "stop";
}

export interface PortUseResult {
  ok: boolean;
  verdict: PortUseVerdict;
  taken: TakenPort[];
  reason: string;
}

interface Owner {
  program: string;
  pid: number;
}

interface PortConflict {
  taken: TakenPort;
  reason: string;
}

const header = /^(?:Netid\s+)?State\s+Recv-Q\s+Send-Q\s+Local Address:Port\s+Peer Address:Port(?:\s+Process)?$/;
const listener = /^(?:tcp\s+)?LISTEN\s+\d+\s+\d+\s+(\S+)\s+(\S+)(?:\s+(.+))?$/;
// ss can print an interface suffix, for example 127.0.0.53%lo:53.
const endpoint = /^(?:\*|(?:\d{1,3}\.){3}\d{1,3}|\[[\da-f:.]*:[\da-f:.]*(?:%[^:\s\]]+)?\])(?:%[^:\s]+)?:(\d{1,5}|\*)$/i;

function readPort(address: string): number | "*" | undefined {
  const match = endpoint.exec(address);
  if (!match) return undefined;
  if (match[1] === "*") return "*";
  const port = Number(match[1]);
  return port <= 65_535 ? port : undefined;
}

function readOwners(details: string | undefined): Owner[] | null {
  if (details === undefined) return [];
  if (!details.startsWith("users:(") || !details.endsWith(")")) return null;
  const records = details.slice("users:(".length, -1);
  const matches = [...records.matchAll(/\("([^"\x00-\x1f\x7f]+)",pid=([1-9]\d*),fd=\d+\)/g)];
  // A partial match could miss another owner of the same socket.
  if (!matches.length || matches.map(([record]) => record).join(",") !== records) return null;
  const owners = matches.map(([, program, pid]) => ({ program, pid: Number(pid) }));
  return owners.every(({ pid }) => Number.isSafeInteger(pid)) ? owners : null;
}

function classifyOwner(port: number, owner: Owner | undefined, options: PortUseOptions): PortConflict {
  if (!owner) {
    return {
      taken: { port, program: null, pid: null, action: "stop" },
      reason: `port ${port} is taken and its owner is unknown`,
    };
  }

  const { program, pid } = owner;
  const holder = `port ${port} is held by ${program} (PID ${pid})`;
  let reason: string;
  if (options.protectPids.includes(pid)) reason = `${holder} with a protected PID`;
  else if (options.protect.includes(program)) reason = `${holder}, a protected program`;
  else if (options.mayStop.includes(program)) {
    return { taken: { port, program, pid, action: "cleanup" }, reason: `${holder}, which is approved for cleanup` };
  } else reason = `${holder}, which is outside the cleanup allowlist`;
  return { taken: { port, program, pid, action: "stop" }, reason };
}

/** Check supplied ss -ltnp text for occupied ports without changing any listeners. */
export function checkPorts(ssText: string, options: PortUseOptions): PortUseResult {
  const needed = new Set(options.need);
  const conflicts = new Map<number, PortConflict>();
  const lines = ssText.split(/\r?\n/).map((line) => line.trim());
  const firstLine = lines.findIndex(Boolean);
  let hasListener = false;
  let unreadableLine: number | undefined;

  for (const [index, line] of lines.entries()) {
    if (!line || (index === firstLine && header.test(line))) continue;

    const row = listener.exec(line);
    const port = row ? readPort(row[1]) : undefined;
    const peer = row ? readPort(row[2]) : undefined;
    const owners = row ? readOwners(row[3]) : null;
    if (typeof port !== "number" || port === 0 || peer === undefined || owners === null) {
      unreadableLine ??= index + 1;
      continue;
    }

    hasListener = true;
    if (!needed.has(port)) continue;
    for (const owner of owners.length ? owners : [undefined]) {
      const previous = conflicts.get(port);
      const conflict = classifyOwner(port, owner, options);
      // The same port can be reported on multiple addresses or with multiple owners.
      if (!previous || (previous.taken.action === "cleanup" && conflict.taken.action === "stop")) {
        conflicts.set(port, conflict);
      }
    }
  }

  const sorted = [...conflicts.values()].sort((a, b) => a.taken.port - b.taken.port);
  const taken = sorted.map((conflict) => conflict.taken);
  if (unreadableLine !== undefined) {
    return { ok: false, verdict: "unreadable", taken, reason: `unreadable report at line ${unreadableLine}, so stop.` };
  }
  if (!hasListener) {
    return { ok: false, verdict: "unreadable", taken, reason: "unreadable report with no listener rows, so stop." };
  }
  if (!taken.length) {
    return { ok: true, verdict: "go", taken, reason: "go because all needed ports are free." };
  }

  const verdict = taken.some(({ action }) => action === "stop") ? "stop" : "cleanup";
  return { ok: false, verdict, taken, reason: `${verdict} because ${sorted.map(({ reason }) => reason).join(" and ")}.` };
}

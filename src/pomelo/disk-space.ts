import { posix } from "node:path";

export interface DiskSpaceLimits {
  readonly stopFreeKb: number;
  readonly cleanFreeKb: number;
  readonly stopUsedPercent: number;
  readonly cleanUsedPercent: number;
}

export interface DiskSpaceMount {
  mount: string;
  path: string;
  freeKb: number;
  usedPercent: number;
}

export interface DiskSpaceResult {
  action: "go" | "clean" | "stop";
  reason: string;
  mounts: DiskSpaceMount[];
}

const defaults: DiskSpaceLimits = {
  stopFreeKb: 1024 ** 2,
  cleanFreeKb: 5 * 1024 ** 2,
  stopUsedPercent: 95,
  cleanUsedPercent: 85,
};

const linuxHeader = "Filesystem 1K-blocks Used Available Use% Mounted on";
const macHeader = "Filesystem 1024-blocks Used Available Capacity iused ifree %iused Mounted on";

/** Check the filesystems for absolute folder paths using a supplied `df -k` snapshot. */
export function diskSpace(
  dfText: string,
  paths: readonly string[],
  limits: Partial<DiskSpaceLimits> = {},
): DiskSpaceResult {
  const { stopFreeKb, cleanFreeKb, stopUsedPercent, cleanUsedPercent } = { ...defaults, ...limits };
  if ([stopFreeKb, cleanFreeKb, stopUsedPercent, cleanUsedPercent].some((value) => !Number.isFinite(value) || value < 0)) {
    return { action: "stop", reason: "Disk space limits must be finite and non-negative.", mounts: [] };
  }

  const [header, ...rows] = dfText.trimStart().split(/\r?\n/);
  const columns = header.trim().replace(/\s+/g, " ");
  if (columns !== linuxHeader && columns !== macHeader) {
    return { action: "stop", reason: "Could not read the df -k header.", mounts: [] };
  }

  // Match the numeric columns before the mount so spaces in either name are preserved.
  const diskColumns = String.raw`^.*\S\s+\d+\s+\d+\s+(-?\d+)\s+(\d+)%`;
  const inodeColumns = columns === macHeader ? String.raw`\s+\d+\s+\d+\s+\d+%` : "";
  const rowPattern = new RegExp(`${diskColumns}${inodeColumns}\\s+(/.*)$`);
  const filesystems: Omit<DiskSpaceMount, "path">[] = [];
  for (const row of rows) {
    if (!row.trim()) continue;
    const match = rowPattern.exec(row);
    if (!match) {
      return { action: "stop", reason: "Could not read a filesystem row in df -k output.", mounts: [] };
    }
    const [, free, used, mount] = match;
    const freeKb = Number(free);
    const usedPercent = Number(used);
    if (!Number.isSafeInteger(freeKb) || !Number.isSafeInteger(usedPercent)) {
      return { action: "stop", reason: "Could not read the disk space numbers in df -k output.", mounts: [] };
    }
    filesystems.push({ mount, freeKb, usedPercent });
  }

  if (!filesystems.length) {
    return { action: "stop", reason: "df -k output contains no filesystem rows.", mounts: [] };
  }
  if (!paths.length) {
    return { action: "stop", reason: "No folders were supplied for the disk space check.", mounts: [] };
  }

  filesystems.sort((left, right) => right.mount.length - left.mount.length);
  const mounts: DiskSpaceMount[] = [];
  let unmatchedPath: string | undefined;
  for (const path of paths) {
    const normalized = posix.normalize(path);
    const filesystem = filesystems.find(({ mount }) =>
      normalized === mount || normalized.startsWith(mount === "/" ? "/" : `${mount}/`),
    );
    if (filesystem) {
      mounts.push({ ...filesystem, path });
    } else {
      unmatchedPath ??= path;
    }
  }
  if (unmatchedPath !== undefined) {
    return { action: "stop", reason: `Could not find a filesystem for folder ${JSON.stringify(unmatchedPath)}.`, mounts };
  }

  for (const [action, freeLimit, usedLimit, instruction] of [
    ["stop", stopFreeKb, stopUsedPercent, "Stop the run"],
    ["clean", cleanFreeKb, cleanUsedPercent, "Clean up first"],
  ] as const) {
    const limitingMount = mounts.find(({ freeKb, usedPercent }) => freeKb < freeLimit || usedPercent >= usedLimit);
    if (limitingMount) {
      const { mount, path, freeKb, usedPercent } = limitingMount;
      return { action, reason: `${instruction}. Folder ${path} is on ${mount}, which has ${freeKb} KB free and is ${usedPercent}% used.`, mounts };
    }
  }

  return { action: "go", reason: "All folders have enough free disk space.", mounts };
}

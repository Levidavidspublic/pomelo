import { posix, win32 } from "node:path";

type Problem = { name: string; reason: string };
type AbsolutePath = { path: string; windows: boolean };

const fridayFolders = ["FRIDAY_HOME", "FRIDAY_STATE_DIR"] as const;
const homeFolders = ["HOME", "USERPROFILE"] as const;
const folderNames = new Set<string>([...fridayFolders, ...homeFolders]);
const drivePath = /^[a-z]:\//i;
const networkPath = /^\/\/[^/.?][^/]*\/[^/]+(?:\/|$)/;

function normalizeAbsolutePath(value: string | undefined, windowsOnly = false): AbsolutePath | undefined {
  if (!value) return;
  const slashes = value.replaceAll("\\", "/");
  const hasDrive = drivePath.test(slashes);
  if (hasDrive || value.startsWith("\\\\") || (windowsOnly && slashes.startsWith("//"))) {
    if (!hasDrive && !networkPath.test(slashes)) return;
    const path = win32.normalize(slashes).replaceAll("\\", "/").replace(/\/+$/, "").toLowerCase();
    return { path, windows: true };
  }
  if (!windowsOnly && value.startsWith("/")) {
    const path = posix.normalize(slashes).replace(/\/+$/, "") || "/";
    return { path, windows: false };
  }
}

/** Check a pasted env listing using only the paths supplied in that text. */
export function checkTestEnv(envText: string): { verdict: "go" | "stop"; problems: Problem[] } {
  const folders = new Map<string, string>();
  const duplicates = new Set<string>();
  const problems: Problem[] = [];
  let malformed = false;

  for (const line of envText.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const assignment = /^([A-Za-z_][A-Za-z0-9_]*)=([^\0\r]*)$/.exec(line);
    if (!assignment) {
      malformed = true;
      continue;
    }
    const [, name, value] = assignment;
    if (!folderNames.has(name)) continue;
    if (folders.has(name) && folders.get(name) !== value) duplicates.add(name);
    folders.set(name, value);
  }

  if (malformed) problems.push({ name: "env", reason: "Paste env output with one KEY=value assignment per line." });
  for (const name of duplicates) problems.push({ name, reason: `${name} has conflicting values.` });

  const homes = homeFolders.map(name => {
    const value = folders.get(name);
    return normalizeAbsolutePath(value, name === "USERPROFILE" && value?.startsWith("//"));
  }).filter(home => home !== undefined);
  const hasWindowsHome = homes.some(home => home.windows);
  const windowsOnly = hasWindowsHome && homes.every(home => home.windows);

  for (const name of fridayFolders) {
    const value = folders.get(name);
    if (duplicates.has(name) || (name === "FRIDAY_STATE_DIR" && value === undefined)) continue;
    const folder = normalizeAbsolutePath(value, windowsOnly);
    let reason: string | undefined;
    if (value === undefined) reason = "is missing.";
    else if (!value.trim()) reason = "is empty.";
    else if (!folder || (homes.length > 0 && folder.windows && !hasWindowsHome)) reason = "must be an absolute folder path.";
    else if (!homes.length) reason = "needs an absolute HOME or USERPROFILE for comparison.";
    else if (homes.some(home => home.path === folder.path)) reason = "points to the user's home folder.";
    else if (homes.some(({ path: home }) => {
      const live = home === "/" ? "/.friday" : `${home}/.friday`;
      return folder.path === live || folder.path.startsWith(`${live}/`);
    })) reason = "points to the live .friday folder or one of its subfolders.";

    if (reason) problems.push({ name, reason: `${name} ${reason}` });
  }

  return { verdict: problems.length ? "stop" : "go", problems };
}

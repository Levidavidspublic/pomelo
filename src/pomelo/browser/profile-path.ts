import { posix } from "node:path";

type ProfileLocation = "local" | "cloud";

export const CLOUD_PROFILE_ROOT = "/data/cloud-browser/profile";

export function profileRoot(location: ProfileLocation, home: string): string {
  return location === "cloud" ? CLOUD_PROFILE_ROOT : posix.join(home, "profiles");
}

export function profileDir(input: {
  id: string;
  location: ProfileLocation;
  home: string;
  taken?: string[];
}): { ok: true; dir: string } | { ok: false; reason: "bad-id" | "bad-home" | "taken" } {
  const { id, location, home, taken } = input;
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) return { ok: false, reason: "bad-id" };
  if (!posix.isAbsolute(home)) return { ok: false, reason: "bad-home" };
  if (taken?.some((takenId) => takenId.toLowerCase() === id)) return { ok: false, reason: "taken" };

  return { ok: true, dir: posix.join(profileRoot(location, home), id) };
}

type Version = [bigint, bigint, bigint];

function parseVersion(value: string): Version | null {
  const match = /^v?(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.exec(value);
  if (!match) return null;
  return [BigInt(match[1]), BigInt(match[2]), BigInt(match[3])];
}

function isNewer(candidate: Version, current: Version): boolean {
  for (let i = 0; i < candidate.length; i++) {
    if (candidate[i] !== current[i]) return candidate[i] > current[i];
  }
  return false;
}

function newestRelease(tags: readonly string[]): { tag: string; version: Version } | null {
  let newest: { tag: string; version: Version } | null = null;
  for (const tag of tags) {
    if (!tag.startsWith("v")) continue;
    const version = parseVersion(tag);
    if (version && (!newest || isNewer(version, newest.version))) newest = { tag, version };
  }
  return newest;
}

export function newestTag(tags: readonly string[]): string | null {
  return newestRelease(tags)?.tag ?? null;
}

export function rebaseCheck(input: { baseVersion: string; upstreamTags: readonly string[] }): {
  needed: boolean;
  target: string | null;
  branch: string | null;
  reason: string;
} {
  const release = newestRelease(input.upstreamTags);
  if (!release) {
    return { needed: false, target: null, branch: null, reason: "Upstream Friday has no stable release tags." };
  }

  const target = release.tag;
  const base = parseVersion(input.baseVersion);
  if (!base) {
    return { needed: false, target, branch: null, reason: "The Friday base version is unreadable. Expected a version like 0.3.4." };
  }
  if (!isNewer(release.version, base)) {
    return { needed: false, target, branch: null, reason: `The Friday base version is already at or ahead of ${target}.` };
  }
  return { needed: true, target, branch: `rebase/friday-${target}`, reason: `Upstream Friday ${target} is newer than the base version.` };
}

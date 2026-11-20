interface ArchiveFacts {
  profileId: string;
  bytes: number;
  sha256: string;
  sealed: boolean;
}

export interface MoveVerifyFacts {
  source: ArchiveFacts;
  target: ArchiveFacts;
  testOpen: "ok" | "failed" | "not-run";
  /** Copy attempts already made, including the copy being checked. */
  triesSoFar: number;
  profileBusy: boolean;
  maxTries?: number;
}

export type MoveVerifyResult = { reason: string } & (
  | { verdict: "complete"; pcCopy: "put-away" }
  | { verdict: "copy-again" | "hold"; pcCopy: "keep" }
);

const DEFAULT_MAX_TRIES = 3;

function validArchive(archive: ArchiveFacts): boolean {
  return archive != null &&
    typeof archive.profileId === "string" && archive.profileId.trim().length > 0 &&
    Number.isSafeInteger(archive.bytes) && archive.bytes > 0 &&
    typeof archive.sha256 === "string" && /^[0-9a-f]{64}$/i.test(archive.sha256) &&
    typeof archive.sealed === "boolean";
}

function hold(reason: string): MoveVerifyResult {
  return { verdict: "hold", pcCopy: "keep", reason };
}

export function moveVerify(facts: MoveVerifyFacts): MoveVerifyResult {
  if (!facts) return hold("invalid-facts");

  const { source, target, testOpen, triesSoFar, profileBusy, maxTries = DEFAULT_MAX_TRIES } = facts;
  if (profileBusy === true) return hold("profile-busy");
  if (
    profileBusy !== false ||
    !validArchive(source) || !validArchive(target) ||
    !Number.isSafeInteger(triesSoFar) || triesSoFar < 0 ||
    !Number.isSafeInteger(maxTries) || maxTries < 1 ||
    (testOpen !== "ok" && testOpen !== "failed" && testOpen !== "not-run")
  ) return hold("invalid-facts");

  if (source.profileId !== target.profileId) return hold("wrong-profile");
  if (!source.sealed || !target.sealed) return hold("not-sealed");

  const sizeMatches = source.bytes === target.bytes;
  const checksumMatches = source.sha256.toLowerCase() === target.sha256.toLowerCase();
  if (!sizeMatches || !checksumMatches) {
    if (triesSoFar >= maxTries) return hold("retry-limit");
    return { verdict: "copy-again", pcCopy: "keep", reason: sizeMatches ? "checksum-mismatch" : "size-mismatch" };
  }

  if (testOpen !== "ok") return hold(`test-open-${testOpen}`);
  return { verdict: "complete", pcCopy: "put-away", reason: "verified" };
}

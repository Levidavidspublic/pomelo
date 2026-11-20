export type CloneDepthResult = {
  ok: boolean;
  verdict: "go" | "deepen" | "stop";
  missing: string[];
  nextStep: string | null;
  reason: string;
};

const commitId = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;

function readLine(text: unknown): string | null {
  return typeof text === "string" ? text.replace(/\r?\n$/, "") : null;
}

export function checkCloneDepth(input: {
  shallowText: unknown;
  tagText: unknown;
  mergeBaseText: unknown;
}): CloneDepthResult {
  const shallow = readLine(input.shallowText);
  const tag = readLine(input.tagText);
  const mergeBase = readLine(input.mergeBaseText);
  const missing: string[] = [];
  const invalid: string[] = [];

  if (shallow === "true") missing.push("shallow clone");
  else if (shallow !== "false") invalid.push("shallow status");

  if (tag === "") missing.push("v0.3.4 tag");
  else if (tag === null || !commitId.test(tag)) invalid.push("v0.3.4 tag lookup");

  if (mergeBase === "") missing.push("merge-base with upstream");
  else if (mergeBase === null || !commitId.test(mergeBase)) invalid.push("merge-base with upstream");

  if (invalid.length > 0) {
    return { ok: false, verdict: "stop", missing, nextStep: null, reason: `Invalid Git output for ${invalid.join(", ")}.` };
  }
  if (missing.length > 0) {
    const command = shallow === "true" ? "git fetch --unshallow --tags upstream" : "git fetch --tags upstream";
    return {
      ok: false,
      verdict: "deepen",
      missing,
      nextStep: `Fetch full history and tags with \`${command}\`.`,
      reason: `The clone needs more history (${missing.join(", ")}).`,
    };
  }
  return {
    ok: true,
    verdict: "go",
    missing,
    nextStep: null,
    reason: "The clone has full history, the v0.3.4 tag, and a merge-base with upstream.",
  };
}

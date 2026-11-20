interface PushRefProblem {
  ref: string;
  kind: "tag" | "protected-branch" | "other-branch" | "delete" | "force" | "unreadable";
  reason: string;
}

export function checkPushRefs(
  porcelainText: string,
  ticket: { number: number; key: string },
): { ok: boolean; problems: PushRefProblem[] } {
  const ownRef = `refs/heads/ticket/${ticket.number}-${ticket.key.toLowerCase()}`;
  const lines = porcelainText.split(/\r?\n/).filter((line) => line !== "" && !line.startsWith("To ") && line !== "Done");
  const problems: PushRefProblem[] = [];

  if (lines.length === 0) {
    problems.push({ ref: "", kind: "unreadable", reason: "The dry run lists no refs to push." });
  }

  for (const line of lines) {
    const [flag, refspec, summary] = line.split("\t", 3);
    const refs = refspec?.match(/^([^:]*):(refs\/(?:[^:/\s]+\/)*[^:/\s]+)$/);
    if (!refs || !summary?.trim() || ![" ", "*", "-", "+", "=", "!"].includes(flag)) {
      problems.push({ ref: refs?.[2] ?? "", kind: "unreadable", reason: "The dry-run ref line is unreadable." });
      continue;
    }

    const [, source, ref] = refs;
    if (flag === "-" || source === "") {
      problems.push({ ref, kind: "delete", reason: "Deleting a remote ref is blocked." });
    } else if (flag === "+") {
      problems.push({ ref, kind: "force", reason: "Force-pushing a remote ref is blocked." });
    } else if (ref.startsWith("refs/tags/")) {
      problems.push({ ref, kind: "tag", reason: "Pushing a tag is blocked." });
    } else if (ref === "refs/heads/main" || /^refs\/heads\/(import|docs|config)\//.test(ref)) {
      problems.push({ ref, kind: "protected-branch", reason: "Pushing to a protected branch is blocked." });
    } else if (ref.startsWith("refs/heads/") && ref !== ownRef) {
      problems.push({ ref, kind: "other-branch", reason: "Workers can push only to their own ticket branch." });
    } else if (ref !== ownRef || (flag !== " " && flag !== "*")) {
      problems.push({ ref, kind: "unreadable", reason: "The ref line does not show a new branch or fast-forward for this ticket." });
    }
  }

  return { ok: problems.length === 0, problems };
}

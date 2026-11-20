interface CommitMessageProblem {
  hash: string;
  kind: "empty-subject" | "fixup" | "wip" | "merge-commit" | "other-ticket" | "too-long" | "revert-of-other";
  subject: string;
  reason: string;
}

const fullHash = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i;
const fixupPrefix = /^(?:fixup|squash|amend)!/;
const wipPrefix = /^(?:wip|tmp|temp)(?![\p{L}\p{M}\p{N}_])/iu;
const ticketReference = /\bP\d+-\d+\b|#\d+\b/gi;

/** Check the output of git log --format=%H%x1f%P%x1f%s%x1e. */
export function commitMessageProblems(logText: string, ticket: { number: number; key: string }): {
  ok: boolean;
  commits: number;
  problems: CommitMessageProblem[];
} {
  const problems: CommitMessageProblem[] = [];
  // The result has no log-error kind. Use empty-subject when there is no usable subject.
  if (logText.trim() === "") {
    problems.push({ hash: "", kind: "empty-subject", subject: "", reason: "The PR has no commits." });
    return { ok: false, commits: 0, problems };
  }

  const records = logText.split(/\x1e(?:\r?\n)?/);
  if (records.at(-1) === "") records.pop();
  const ticketKey = ticket.key.toUpperCase();
  let commits = 0;

  for (const [index, record] of records.entries()) {
    const fields = record.split("\x1f");
    const [hash, parentList, subject] = fields;
    const parents = parentList ? parentList.split(" ") : [];
    if (
      fields.length !== 3 || !fullHash.test(hash) || parents.some((parent) => !fullHash.test(parent)) || subject.includes("\n")
    ) {
      problems.push({
        hash: "",
        kind: "empty-subject",
        subject: "",
        reason: `Record ${index + 1} is not a valid git log record.`,
      });
      continue;
    }

    commits++;
    const blankSubject = subject.trim() === "";
    const characters = Array.from(subject);
    const shortHash = hash.slice(0, 7);
    const label = blankSubject ? shortHash : `${shortHash} (${characters.slice(0, 80).join("")})`;
    const report = (kind: CommitMessageProblem["kind"], reason: string) => {
      problems.push({ hash, kind, subject, reason: `Commit ${label} ${reason}.` });
    };

    if (blankSubject) report("empty-subject", "has a blank subject");
    if (fixupPrefix.test(subject)) report("fixup", "has a fixup, squash, or amend subject");
    if (wipPrefix.test(subject)) report("wip", "has a work-in-progress subject");
    if (parents.length >= 2) report("merge-commit", "is a merge commit");
    if (characters.length > 200) report("too-long", "has a subject longer than 200 characters");

    const otherTicket = subject.match(ticketReference)?.find((reference) =>
      reference.startsWith("#") ? Number(reference.slice(1)) !== ticket.number : reference.toUpperCase() !== ticketKey,
    );
    if (otherTicket) {
      if (/^revert\b/i.test(subject)) report("revert-of-other", "reverts a change from another ticket");
      else report("other-ticket", "names another ticket");
    }
  }

  return { ok: problems.length === 0, commits, problems };
}

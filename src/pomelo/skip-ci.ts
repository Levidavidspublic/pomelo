const bracketedMarker = /\[(?:skip[ -](?:ci|actions)|(?:ci|actions)[ -]skip|no[ -]ci)\]/i;
const skipChecksTrailer = /(?:^|\n)(skip-checks:[ \t]*true)[ \t\r\n]*$/i;

/** Report the first skip marker in each matching commit, preserving its spelling. */
export function skipCiCommits(
  commits: readonly { sha: string; message: string }[],
): { sha: string; marker: string }[] {
  const matches: { sha: string; marker: string }[] = [];
  for (const { sha, message } of commits) {
    if (typeof message !== "string") continue;
    const marker = bracketedMarker.exec(message)?.[0] ?? skipChecksTrailer.exec(message)?.[1];
    if (marker) matches.push({ sha, marker });
  }
  return matches;
}

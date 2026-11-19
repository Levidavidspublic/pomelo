const activeStates = new Set(["new", "running", "pr_open", "stuck"]);

type ScopeOverlapResult = {
  clashes: { file: string; keep: number; wait: number }[];
  problems: { number: number; reason: "no-paths" }[];
};

export function scopePaths(scope: string): string[] {
  const paths = new Set<string>();
  for (const [, entry] of scope.matchAll(/`([^`\r\n]*)`/g)) {
    const path = entry.trim().replace(/^(?:\.\/)+/, "");
    if (path) paths.add(path);
  }
  return [...paths];
}

export function scopeOverlaps(tickets: { number: number; state: string; scope: string }[]): ScopeOverlapResult {
  const result: ScopeOverlapResult = { clashes: [], problems: [] };
  const ticketsByFile = new Map<string, Set<number>>();

  for (const { number, state, scope } of tickets) {
    if (!activeStates.has(state)) continue;

    const paths = scopePaths(scope);
    if (paths.length === 0) result.problems.push({ number, reason: "no-paths" });

    for (const file of paths) {
      let numbers = ticketsByFile.get(file);
      if (!numbers) {
        numbers = new Set();
        ticketsByFile.set(file, numbers);
      }
      numbers.add(number);
    }
  }

  for (const [file, ticketNumbers] of ticketsByFile) {
    const numbers = [...ticketNumbers].sort((a, b) => a - b);
    for (let i = 0; i < numbers.length; i++) {
      for (let j = i + 1; j < numbers.length; j++) {
        result.clashes.push({ file, keep: numbers[i], wait: numbers[j] });
      }
    }
  }

  result.clashes.sort((a, b) =>
    a.keep - b.keep || a.wait - b.wait || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
  result.problems.sort((a, b) => a.number - b.number);
  return result;
}

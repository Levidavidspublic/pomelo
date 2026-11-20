export type WorktreeListVerdict = "clean" | "cleanup" | "unreadable";

export interface WorktreeListOptions {
  /** Branches whose ticket currently has a live claim. */
  liveBranches: Iterable<string>;
  now?: number;
}

export interface KeptWorktree {
  path: string;
  reason: string;
}

export interface LeftoverWorktree extends KeptWorktree {
  branch: string | null;
}

export interface WorktreeListResult {
  verdict: WorktreeListVerdict;
  remove: LeftoverWorktree[];
  keep: KeptWorktree[];
  summary: string;
}

interface WorktreeEntry {
  path: string;
  branch: string | null;
  bare: boolean;
  detached: boolean;
  locked: boolean;
  prunable: boolean;
}

const ticketBranch = /^ticket\/\d+-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/;
const branchRefPrefix = /^refs\/heads\//;

function readWorktree(block: string): WorktreeEntry | undefined {
  const [header, ...lines] = block.split("\n");
  const path = header.slice("worktree ".length);
  if (!header.startsWith("worktree ") || !path.trim()) return;

  const fields = new Map<string, string>();
  for (const line of lines) {
    const [name] = line.split(" ", 1);
    const value = line.slice(name.length + 1);
    if (fields.has(name)) return;
    switch (name) {
      case "HEAD":
        if (!/^[0-9a-f]+$/i.test(value)) return;
        break;
      case "branch":
        if (!/^refs\/heads\/\S+$/.test(value)) return;
        break;
      case "bare":
      case "detached":
        if (line !== name) return;
        break;
      case "locked":
      case "prunable":
        break;
      default:
        return;
    }
    fields.set(name, value);
  }

  const branch = fields.get("branch")?.replace(branchRefPrefix, "") ?? null;
  const bare = fields.has("bare");
  const detached = fields.has("detached");
  const locked = fields.has("locked");
  const prunable = fields.has("prunable");
  const hasHead = fields.has("HEAD");

  if (bare && (hasHead || branch || detached)) return;
  if (!bare && (!hasHead || (!branch && !detached && !prunable))) return;
  if (branch && detached) return;

  return { path, branch, bare, detached, locked, prunable };
}

function keepReason(entry: WorktreeEntry, isMain: boolean, liveBranches: ReadonlySet<string>): string | undefined {
  if (isMain) return "This is the main worktree.";
  if (entry.bare) return "This is a bare repository.";
  if (entry.locked) return "This worktree is locked.";
  if (entry.detached) return "This worktree has a detached HEAD.";
  if (entry.branch !== null) {
    if (!ticketBranch.test(entry.branch)) return "This branch is outside the ticket branch pattern.";
    if (liveBranches.has(entry.branch)) return "The ticket has a live claim.";
  }
}

/** Identify cleanup candidates from a porcelain listing and a snapshot of live claims. */
export function leftoverWorktrees(porcelainText: string, { liveBranches }: WorktreeListOptions): WorktreeListResult {
  const unreadable: WorktreeListResult = { verdict: "unreadable", remove: [], keep: [], summary: "Unreadable worktree list." };
  const text = porcelainText.replace(/\r\n/g, "\n").replace(/\n+$/, "");
  if (!text || /[\0\r]/.test(text)) return unreadable;

  const claimed = new Set(Array.from(liveBranches, (branch) => branch.replace(branchRefPrefix, "")));
  const paths = new Set<string>();
  const keep: KeptWorktree[] = [];
  const remove: LeftoverWorktree[] = [];
  for (const [index, block] of text.split(/\n{2,}/).entries()) {
    const entry = readWorktree(block);
    if (!entry || paths.has(entry.path)) return unreadable;
    const { path, branch, prunable } = entry;
    paths.add(path);

    const reason = keepReason(entry, index === 0, claimed);
    if (reason) {
      keep.push({ path, reason });
    } else {
      remove.push({ path, branch, reason: prunable ? "Git marks this worktree as prunable." : "The ticket has no live claim." });
    }
  }

  if (remove.length === 0) {
    const noun = keep.length === 1 ? "worktree" : "worktrees";
    return { verdict: "clean", remove, keep, summary: `Clean with ${keep.length} ${noun} kept.` };
  }
  const noun = remove.length === 1 ? "worktree" : "worktrees";
  return { verdict: "cleanup", remove, keep, summary: `${remove.length} leftover ${noun} to remove, ${keep.length} kept.` };
}

export interface TagCallInput {
  openedBy: string;
  projectTags: readonly string[];
  tagsSetByAmit: boolean;
  slug?: string;
  caller: {
    agentId: string;
    isSubAgent: boolean;
  };
}

export interface TagCallDecision {
  verdict: "set" | "propose" | "already" | "refuse";
  reason: string;
}

export function decideTagCall({
  openedBy, projectTags, tagsSetByAmit, slug, caller,
}: TagCallInput): TagCallDecision {
  if (typeof slug !== "string" || !slug.trim()) {
    return { verdict: "refuse", reason: "A project tag is required." };
  }
  if (projectTags.includes(slug)) {
    return { verdict: "already", reason: "The thread already has this tag." };
  }
  if (caller.isSubAgent) {
    return { verdict: "refuse", reason: "Sub-agents cannot add project tags." };
  }
  if (tagsSetByAmit) {
    return { verdict: "propose", reason: "Amit has already chosen the tags for this thread." };
  }
  if (projectTags.length === 0) {
    return { verdict: "set", reason: "The thread has no project tags." };
  }
  if (openedBy === caller.agentId) {
    return { verdict: "set", reason: "The calling agent opened this thread." };
  }
  return { verdict: "propose", reason: "The thread already has tags and someone else opened it." };
}

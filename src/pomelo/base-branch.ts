export interface BaseBranchInput {
  prBase: string;
  prHead: string;
  importBranch: string;
  mainBranch: string;
  importMerged: boolean;
  needsFriday: boolean;
}

export type BaseBranchResult =
  | { ok: true; expectedBase: string; reason: "ok" }
  | {
      ok: false;
      expectedBase: string;
      reason: "should_stack_on_import" | "should_target_main" | "head_equals_base" | "base_is_live_branch";
    }
  | { ok: false; expectedBase: null; reason: "bad_input" };

function normalizeBranch(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/^(?:refs\/heads\/|origin\/)/, "").trim() : "";
}

export function checkBaseBranch(input: BaseBranchInput): BaseBranchResult {
  const badInput = { ok: false, expectedBase: null, reason: "bad_input" } as const;
  if (typeof input !== "object" || input === null) return badInput;

  const { importMerged, needsFriday } = input;
  const base = normalizeBranch(input.prBase);
  const head = normalizeBranch(input.prHead);
  const importBranch = normalizeBranch(input.importBranch);
  const mainBranch = normalizeBranch(input.mainBranch);
  if (!base || !head || !importBranch || !mainBranch ||
      typeof importMerged !== "boolean" || typeof needsFriday !== "boolean") {
    return badInput;
  }

  const stackOnImport = needsFriday && !importMerged;
  const expectedBase = stackOnImport ? importBranch : mainBranch;
  if (head === base) return { ok: false, expectedBase, reason: "head_equals_base" };
  if (base !== importBranch && base !== mainBranch) return { ok: false, expectedBase, reason: "base_is_live_branch" };
  if (base === expectedBase) return { ok: true, expectedBase, reason: "ok" };
  return { ok: false, expectedBase, reason: stackOnImport ? "should_stack_on_import" : "should_target_main" };
}

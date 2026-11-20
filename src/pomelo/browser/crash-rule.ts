export type CrashStepKind = "read" | "navigate" | "click" | "type" | "fill" | "import" | "upload" | "download" | "none";

export interface CrashInput {
  what: "page" | "browser";
  crashesThisJob: number;
  lastStepKind: CrashStepKind;
  stepFinished: boolean;
  location: "local" | "cloud";
}

export interface CrashDecision {
  verdict: "reload" | "restart-browser" | "hold" | "fail";
  replayLastStep: false;
  reason: string;
}

/** Recommend recovery from a crash using only the job's step status and crash history. */
export function decideAfterCrash({ what, crashesThisJob, lastStepKind, stepFinished, location }: CrashInput): CrashDecision {
  const crash = what === "page" ? "The page crashed" : "The browser crashed";
  const where = location === "cloud" ? " on the VPS" : "";
  const decision = (verdict: CrashDecision["verdict"], next: string): CrashDecision => ({
    verdict,
    replayLastStep: false,
    reason: `${crash}${where}. ${next}`,
  });

  if (crashesThisJob >= 4) return decision("fail", "The job reached its crash limit.");
  if (crashesThisJob !== 1) return decision("hold", "Wait for Amit to review the crash history.");

  switch (lastStepKind) {
    case "fill":
    case "import":
    case "upload":
      return decision("hold", "Wait for Amit to review the last step.");
    case "read":
    case "navigate":
    case "click":
    case "type":
    case "download":
      if (stepFinished !== true) return decision("hold", "Wait for Amit to review the unfinished step.");
      break;
    case "none":
      break;
    default:
      return decision("hold", "Wait for Amit to review the unknown step.");
  }

  return what === "page"
    ? decision("reload", "Reload and read the page again.")
    : decision("restart-browser", "Restart the browser and read the page again.");
}

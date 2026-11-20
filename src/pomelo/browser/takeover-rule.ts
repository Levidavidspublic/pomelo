export interface TakeoverState {
  readonly driver: "agent" | "amit";
  readonly takenAt?: number;
  readonly handedBackAt?: number;
  /** The runner sets this when the page changes during manual control. It stays set until a masked read. */
  readonly pageChangedSinceTakeOver: boolean;
}

const AGENT_ACTIONS = ["click", "type", "fill", "navigate", "script", "screenshot", "import"] as const;
export type TakeoverAction = (typeof AGENT_ACTIONS)[number];

export type TakeoverEvent =
  // For fill and import, the runner supplies the time from an independently verified approval for this step.
  | { type: "agent_action"; kind: TakeoverAction; approvedAt?: number }
  // The runner sends this on successful completion of a fresh masked page read.
  | { type: "agent_reread"; startedAt: number }
  | { type: "amit_take_over" }
  | { type: "amit_hand_back" }
  | { type: "amit_input"; text?: string };

export interface TakeoverResult {
  allow: boolean;
  next: TakeoverState;
  hold?: "Amit is driving" | "Amit is not driving" | "Read the masked page again"
    | "A new approval is required" | "Unknown browser event" | "Invalid browser control state"
    | "Invalid browser event time";
  mustReread: boolean;
}

/** Decide browser control using only the runner's state, event, and timestamps. */
export function takeoverStep(state: TakeoverState, event: TakeoverEvent, now: number): TakeoverResult {
  if (!state || (state.driver !== "agent" && state.driver !== "amit")
    || typeof state.pageChangedSinceTakeOver !== "boolean"
    || (state.takenAt !== undefined && !Number.isFinite(state.takenAt))
    || (state.handedBackAt !== undefined && (!Number.isFinite(state.handedBackAt) || state.driver === "amit"))
    || (state.takenAt !== undefined && state.handedBackAt !== undefined && state.handedBackAt < state.takenAt)) {
    return {
      allow: false,
      next: { driver: "amit", pageChangedSinceTakeOver: true },
      hold: "Invalid browser control state",
      mustReread: false,
    };
  }

  const { driver, takenAt, handedBackAt, pageChangedSinceTakeOver } = state;
  const next: TakeoverState = {
    driver,
    ...(takenAt === undefined ? {} : { takenAt }),
    ...(handedBackAt === undefined ? {} : { handedBackAt }),
    pageChangedSinceTakeOver,
  };
  const mustReread = driver === "agent" && pageChangedSinceTakeOver;
  const refuse = (hold: NonNullable<TakeoverResult["hold"]>): TakeoverResult => (
    { allow: false, next, hold, mustReread }
  );
  const allow = { allow: true, next, mustReread };

  if (!Number.isFinite(now) || (takenAt !== undefined && now < takenAt)
    || (handedBackAt !== undefined && now < handedBackAt)) {
    return refuse("Invalid browser event time");
  }

  switch (event?.type) {
    case "amit_take_over":
      if (driver === "amit") return allow;
      return {
        allow: true,
        next: { driver: "amit", takenAt: now, pageChangedSinceTakeOver },
        mustReread: false,
      };
    case "amit_hand_back":
      if (driver === "agent") return allow;
      return {
        allow: true,
        next: { ...next, driver: "agent", handedBackAt: now },
        mustReread: pageChangedSinceTakeOver,
      };
    case "amit_input":
      return driver === "amit" ? allow : refuse("Amit is not driving");
    case "agent_action":
      if (driver === "amit") return refuse("Amit is driving");
      if (!AGENT_ACTIONS.includes(event.kind)) return refuse("Unknown browser event");
      if (mustReread) return refuse("Read the masked page again");
      if ((event.kind === "fill" || event.kind === "import") && handedBackAt !== undefined) {
        const { approvedAt } = event;
        if (approvedAt === undefined || !Number.isFinite(approvedAt) || approvedAt <= handedBackAt || approvedAt > now) {
          return refuse("A new approval is required");
        }
      }
      return allow;
    case "agent_reread":
      if (driver === "amit") return refuse("Amit is driving");
      if (handedBackAt === undefined || !Number.isFinite(event.startedAt)
        || event.startedAt <= handedBackAt || event.startedAt > now) {
        return refuse("Read the masked page again");
      }
      return { allow: true, next: { ...next, pageChangedSinceTakeOver: false }, mustReread: false };
    default:
      return refuse("Unknown browser event");
  }
}

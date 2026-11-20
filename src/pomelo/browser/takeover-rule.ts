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

  const lastControlChangeAt = handedBackAt ?? takenAt;
  const validTime = Number.isFinite(now) && (lastControlChangeAt === undefined || now >= lastControlChangeAt);
  if (event?.type === "amit_take_over") {
    if (driver === "amit") return allow;
    // Manual control starts immediately. Keep the last known timestamp if the clock is unreliable.
    const takeoverAt = validTime ? now : lastControlChangeAt;
    return {
      allow: true,
      next: { driver: "amit", ...(takeoverAt === undefined ? {} : { takenAt: takeoverAt }), pageChangedSinceTakeOver },
      mustReread: false,
    };
  }
  if (driver === "amit" && (event?.type === "agent_action" || event?.type === "agent_reread")) {
    return refuse("Amit is driving");
  }
  if (!validTime) return refuse("Invalid browser event time");

  switch (event?.type) {
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
      if (!Number.isFinite(event.startedAt) || event.startedAt > now
        || (lastControlChangeAt !== undefined && event.startedAt <= lastControlChangeAt)) {
        return refuse("Read the masked page again");
      }
      return { allow: true, next: { ...next, pageChangedSinceTakeOver: false }, mustReread: false };
    default:
      return refuse("Unknown browser event");
  }
}

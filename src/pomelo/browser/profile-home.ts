export type ProfileHome = "pc" | "vps";
export type ProfileMoveState = "settled" | "moving-out" | "moving-in";

export interface ProfileHomeInput {
  home: ProfileHome;
  moveState: ProfileMoveState;
  machine: ProfileHome;
  /** Machine holding a live job or lock, or null when neither is live. */
  liveOwner: ProfileHome | null;
}

export type ProfileHomeResult = { message: string } & (
  | { decision: "open"; reason: "at-home" }
  | { decision: "wait"; reason: "move-in-progress" | "held-elsewhere" }
  | { decision: "refuse"; reason: "wrong-home" | "unknown-home" | "unknown-move-state" | "unknown-machine" | "unknown-live-owner" }
);

/** Decide from the profile and live ownership supplied by the caller. */
export function checkProfileHome({ home, moveState, machine, liveOwner }: ProfileHomeInput): ProfileHomeResult {
  if (home !== "pc" && home !== "vps") {
    return { decision: "refuse", reason: "unknown-home", message: "This profile's home is unknown." };
  }
  if (moveState !== "settled" && moveState !== "moving-out" && moveState !== "moving-in") {
    return { decision: "refuse", reason: "unknown-move-state", message: "This profile's move status is unknown." };
  }
  if (machine !== "pc" && machine !== "vps") {
    return { decision: "refuse", reason: "unknown-machine", message: "The requesting machine is unknown." };
  }
  if (moveState !== "settled") {
    return { decision: "wait", reason: "move-in-progress", message: "This profile is moving. Wait for the move to finish." };
  }
  if (liveOwner !== null && liveOwner !== "pc" && liveOwner !== "vps") {
    return { decision: "refuse", reason: "unknown-live-owner", message: "The machine using this profile is unknown." };
  }
  if (liveOwner !== null && liveOwner !== machine) {
    return { decision: "wait", reason: "held-elsewhere", message: "This profile is in use on another machine. Wait for it to close." };
  }
  if (home !== machine) {
    return {
      decision: "refuse",
      reason: "wrong-home",
      message: home === "vps"
        ? "This profile lives on the VPS. Open it there or move it back."
        : "This profile lives on the PC. Open it there or move it to the VPS.",
    };
  }
  return { decision: "open", reason: "at-home", message: "This profile can open on this machine." };
}

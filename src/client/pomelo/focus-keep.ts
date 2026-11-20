const focusTargets = {
  "thread-opened-by-agent": null,
  "thread-opened-by-user": "composer",
  "card-arrived": "card",
  "panel-opened": "panel",
  "approval-card-shown": null,
  "notice-shown": null,
  "rail-updated": "rail-row",
} as const;

export interface FocusChange {
  kind: keyof typeof focusTargets;
  /** A user cause means the key or pointer action directly requested this change. */
  cause: "user-key" | "user-pointer" | "agent" | "system";
}

export interface FocusState {
  focus: "composer" | "rail" | "panel" | "card" | "outside-app" | "none";
  hasUnsentText: boolean;
  /** True during an active IME or dictation composition. */
  composing: boolean;
  /** Both timestamps use the same origin and are measured in milliseconds. */
  now: number;
  /** Use -Infinity before any text arrives. */
  lastTextAt: number;
  /** Defaults to 1500 ms. */
  quietMs?: number;
}

export interface FocusAnswer {
  move: boolean;
  target?: "composer" | "rail-row" | "panel" | "card";
  announce?: "polite" | "none";
  reason: string;
}

export function mayMoveFocus({ kind, cause }: FocusChange, state: FocusState): FocusAnswer {
  const background = cause === "agent" || cause === "system";
  const announce = background ? "polite" : "none";

  if (!Object.hasOwn(focusTargets, kind)) {
    return { move: false, announce, reason: "Unknown screen change." };
  }
  if (kind === "approval-card-shown") {
    return { move: false, announce: "polite", reason: "Approval cards are announced without moving focus." };
  }
  const target = focusTargets[kind];
  if (target === null) {
    return { move: false, announce: "polite", reason: "This screen change only needs an announcement." };
  }
  if (state.focus === "outside-app") {
    return { move: false, announce, reason: "Focus is outside Pomelo." };
  }
  if (background) {
    return { move: false, announce, reason: "A background change leaves focus where it is." };
  }
  if (cause !== "user-key" && cause !== "user-pointer") {
    return { move: false, announce, reason: "Unknown screen change cause." };
  }
  if (state.composing) {
    return { move: false, announce, reason: "The user is still composing or dictating text." };
  }
  if (state.now - state.lastTextAt < (state.quietMs ?? 1_500)) {
    const subject = state.hasUnsentText ? "The composer draft" : "Recent text input";
    return { move: false, announce, reason: `${subject} is still within the quiet window.` };
  }

  return { move: true, target, announce, reason: "A direct user action requested this change." };
}

export interface ComposerKeyEvent {
  readonly key: string;
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly isComposing: boolean;
  readonly keyCode?: number;
}

export interface ComposerKeyState {
  readonly text: string;
  readonly sending: boolean;
  readonly narrow: boolean;
  readonly menuOpen: boolean;
}

export interface ComposerKeyResult {
  action: "send" | "newline" | "none";
  reason: string;
}

export function composerKeyAction(event: ComposerKeyEvent, state: ComposerKeyState): ComposerKeyResult {
  if (event.key !== "Enter") return { action: "none", reason: "not-enter" };
  if (event.isComposing || event.keyCode === 229) return { action: "none", reason: "composing" };
  if (state.menuOpen) return { action: "none", reason: "menu-open" };

  if (state.narrow) return { action: "newline", reason: "narrow" };
  if (event.shiftKey) return { action: "newline", reason: "shift-enter" };
  if (event.altKey) return { action: "newline", reason: "alt-enter" };

  if (state.sending) return { action: "none", reason: "sending" };
  if (!state.text.trim()) return { action: "none", reason: "blank" };
  return { action: "send", reason: event.ctrlKey || event.metaKey ? "send-shortcut" : "enter" };
}

import { isNarrow } from "../narrow.js";
import type { SidePanel } from "./side-panel.js";

type Column = "rail" | "chat" | "panel";

const backFrom = { rail: null, chat: "rail", panel: "chat" } as const;

/** Derives visibility and navigation from the caller's current thread and panel selection. */
export function narrowLayout(input: {
  width: number;
  view: Column;
  threadOpen: boolean;
  panelOpen: SidePanel | null;
}): {
  narrow: boolean;
  show: Record<Column, boolean>;
  back: "rail" | "chat" | null;
  focus: Column;
} {
  const { width, view, threadOpen, panelOpen } = input;
  const narrow = isNarrow(width);
  let focus = view;
  if (!threadOpen) {
    focus = "rail";
  } else if (view === "panel" && panelOpen === null) {
    focus = "chat";
  }

  return {
    narrow,
    show: {
      rail: !narrow || focus === "rail",
      chat: !narrow || focus === "chat",
      panel: !narrow || focus === "panel",
    },
    back: narrow ? backFrom[focus] : null,
    focus,
  };
}

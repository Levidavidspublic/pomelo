export type RailItem =
  | { id: string; type: "group"; folded: boolean }
  | { id: string; type: "thread"; groupId: string };

export type RailKeyResult = {
  focus: string | null;
  action:
    | { type: "open"; threadId: string }
    | { type: "fold"; groupId: string }
    | { type: "unfold"; groupId: string }
    | null;
};

const movementKeys = new Set(["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"]);

export function railKey(items: readonly RailItem[], focusId: string | null, key: string): RailKeyResult {
  const groups = new Map<string, boolean>();
  for (const item of items) {
    if (item.type === "group") groups.set(item.id, item.folded);
  }

  const focused = items.find((item) => item.id === focusId);
  if (focused?.type === "thread" && groups.get(focused.groupId)) {
    return { focus: focused.groupId, action: null };
  }

  const visible = items.filter((item) => item.type === "group" || !groups.get(item.groupId));
  if (!focused) {
    return { focus: movementKeys.has(key) ? visible[0]?.id ?? null : null, action: null };
  }

  switch (key) {
    case "ArrowDown":
      return { focus: visible[visible.indexOf(focused) + 1]?.id ?? focused.id, action: null };
    case "ArrowUp":
      return { focus: visible[visible.indexOf(focused) - 1]?.id ?? focused.id, action: null };
    case "Home":
      return { focus: visible[0].id, action: null };
    case "End":
      return { focus: visible[visible.length - 1].id, action: null };
    case "ArrowLeft":
      if (focused.type === "thread") {
        return { focus: groups.has(focused.groupId) ? focused.groupId : focused.id, action: null };
      }
      if (!focused.folded) return { focus: focused.id, action: { type: "fold", groupId: focused.id } };
      break;
    case "ArrowRight":
      if (focused.type === "group") {
        if (focused.folded) return { focus: focused.id, action: { type: "unfold", groupId: focused.id } };
        const firstThread = visible.find((item) => item.type === "thread" && item.groupId === focused.id);
        return { focus: firstThread?.id ?? focused.id, action: null };
      }
      break;
    case "Enter":
    case " ":
      if (focused.type === "thread") return { focus: focused.id, action: { type: "open", threadId: focused.id } };
      return { focus: focused.id, action: { type: focused.folded ? "unfold" : "fold", groupId: focused.id } };
  }

  return { focus: focused.id, action: null };
}

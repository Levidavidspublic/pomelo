type HomeStartDraft = {
  text: string;
  projectTag: string | null;
};

export type HomeStartState =
  | (HomeStartDraft & { status: "idle" | "sending" })
  | (HomeStartDraft & { status: "failed"; reason: string })
  | { status: "started"; text: ""; projectTag: null; threadId: string };

export type HomeStartEvent =
  | { type: "pickChip"; slug: string }
  | { type: "clearChip" }
  | { type: "type"; text: string }
  | { type: "send" }
  | { type: "started"; threadId: string }
  | { type: "failed"; reason: string };

export type HomeStartRequest = {
  text: string;
  projectTags: string[];
  openedBy: "person";
};

export function initialHomeStart(): HomeStartState {
  return { status: "idle", text: "", projectTag: null };
}

export function homeStartReducer(state: HomeStartState, event: HomeStartEvent): HomeStartState {
  if (state.status === "sending") {
    if (event.type === "started") return { status: "started", text: "", projectTag: null, threadId: event.threadId };
    if (event.type === "failed") return { ...state, status: "failed", reason: event.reason };
    return state;
  }

  const { text, projectTag } = state;
  switch (event.type) {
    case "pickChip":
      return { status: "idle", text, projectTag: event.slug };
    case "clearChip":
      return { status: "idle", text, projectTag: null };
    case "type":
      return { status: "idle", text: event.text, projectTag };
    case "send":
      return text.trim() ? { status: "sending", text, projectTag } : state;
    case "started":
    case "failed":
      return state;
  }
}

/** On a send press, read the request from the current state and apply `send` before dispatching it. */
export function homeStartRequest(state: HomeStartState): HomeStartRequest | null {
  if (state.status === "sending") return null;
  const text = state.text.trim();
  if (!text) return null;
  return { text, projectTags: state.projectTag === null ? [] : [state.projectTag], openedBy: "person" };
}

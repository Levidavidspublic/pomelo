export type WidgetStatus = "open" | "sending" | "answered" | "closed";
export type WidgetValue = string | number | boolean | readonly string[];

export type WidgetPick = {
  readonly value: WidgetValue;
  readonly label?: string;
};

export type WidgetState = { readonly cardId: string } & (
  | { readonly status: "open"; readonly picked?: WidgetPick; readonly reason?: string }
  | { readonly status: "sending" | "answered"; readonly picked: WidgetPick }
  | { readonly status: "closed" }
);

export type WidgetEvent = { readonly cardId: string } & (
  | { readonly type: "pick"; readonly pick: WidgetPick }
  | { readonly type: "send" | "accepted" | "expired" }
  | { readonly type: "refused"; readonly reason: string }
  | { readonly type: "reload"; readonly answer?: WidgetPick }
);

export type WidgetView = {
  status: WidgetStatus;
  label: string;
  pickedLabel?: string;
  reason?: string;
  canAnswer: boolean;
  busy: boolean;
};

const labels: Record<WidgetStatus, string> = {
  open: "Open",
  sending: "Sending",
  answered: "Answered",
  closed: "Closed",
};

const LABEL_LIMIT = 80;
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function displayText(text: string): string {
  const line = text.replace(/[\r\n\u2028\u2029]+/g, " ").trim();
  if (line.length <= LABEL_LIMIT) return line;
  // Leave room for the ellipsis and cut before the grapheme that would cross the limit.
  const end = graphemes.segment(line).containing(LABEL_LIMIT - 1)?.index ?? LABEL_LIMIT - 1;
  return line.slice(0, end).trimEnd() + "…";
}

function pickedLabel({ value, label }: WidgetPick): string {
  if (label !== undefined) return displayText(label);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return displayText(typeof value === "object" ? value.join(", ") : String(value));
}

function copyPick(pick: WidgetPick): WidgetPick {
  return { ...pick, value: typeof pick.value === "object" ? [...pick.value] : pick.value };
}

export function startWidget(cardId: string): WidgetState {
  return { cardId, status: "open" };
}

export function widgetStep(state: WidgetState, event: WidgetEvent): WidgetState {
  const { cardId, status } = state;
  if (event.cardId !== cardId || status === "answered" || status === "closed") return state;

  switch (event.type) {
    case "pick":
      return status === "open" ? { cardId, status, picked: copyPick(event.pick) } : state;
    case "send":
      return status === "open" && state.picked ? { cardId, status: "sending", picked: state.picked } : state;
    case "accepted":
      return status === "sending" ? { cardId, status: "answered", picked: state.picked } : state;
    case "refused":
      return status === "sending"
        ? { cardId, status: "open", picked: state.picked, reason: event.reason }
        : state;
    case "expired":
      return status === "open" ? { cardId, status: "closed" } : state;
    case "reload":
      return event.answer === undefined
        ? startWidget(cardId)
        : { cardId, status: "answered", picked: copyPick(event.answer) };
  }
}

/** The label, pick and reason are text to display literally. */
export function widgetView(state: WidgetState): WidgetView {
  const { status } = state;
  const picked = status === "closed" ? undefined : state.picked;
  const reason = status === "open" ? state.reason : undefined;
  return {
    status,
    label: labels[status],
    ...(picked === undefined ? {} : { pickedLabel: pickedLabel(picked) }),
    ...(reason === undefined ? {} : { reason: displayText(reason) }),
    canAnswer: status === "open",
    busy: status === "sending",
  };
}

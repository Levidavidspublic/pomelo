import { useId } from "react";
import type { ProjectChip } from "./home-chips.js";
import { homeStartRequest, type HomeStartEvent, type HomeStartState } from "./home-start.js";

export interface PomeloHomeStartProps {
  chips: readonly ProjectChip[];
  state: HomeStartState;
  dir: "ltr" | "rtl";
  dispatch: (event: HomeStartEvent) => void;
}

interface HomeStartKey {
  key: string;
  shiftKey: boolean;
  isComposing: boolean;
  repeat?: boolean;
}

export function homeStartKeyAction(state: HomeStartState, key: HomeStartKey): "send" | "new-line" | null {
  if (key.key !== "Enter" || key.isComposing) return null;
  if (key.shiftKey) return "new-line";
  return !key.repeat && homeStartRequest(state) !== null ? "send" : null;
}

const focusClassName = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function PomeloHomeStart({ chips, state, dir, dispatch }: PomeloHomeStartProps) {
  const id = useId();
  const messageId = `${id}-message`;
  const reasonId = `${id}-reason`;
  const opening = state.status === "sending";
  const canSend = homeStartRequest(state) !== null;
  const sendReason = opening ? "Opening a thread." : canSend ? null : "Write a message to send.";

  return (
    <div dir={dir} className="flex flex-col gap-2 rounded-2xl border border-border bg-background p-3">
      <label htmlFor={messageId} className="text-sm font-medium">Message</label>
      <textarea
        id={messageId}
        dir={dir}
        rows={3}
        value={state.text}
        readOnly={opening}
        className={`w-full rounded-md border border-border bg-background p-2 text-start ${focusClassName}`}
        onChange={(event) => dispatch({ type: "type", text: event.currentTarget.value })}
        onKeyDown={(event) => {
          const isComposing = event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229;
          const action = homeStartKeyAction(state, {
            key: event.key,
            shiftKey: event.shiftKey,
            isComposing,
            repeat: event.repeat,
          });
          if (action === "new-line" || event.key !== "Enter" || isComposing) return;
          event.preventDefault();
          if (action === "send") dispatch({ type: "send" });
        }}
      />
      {chips.length > 0 && (
        <div role="group" aria-label="Projects" className="flex flex-wrap gap-2">
          {chips.map((chip, index) => {
            const picked = state.projectTag === chip.slug;
            const chipLabelId = `${id}-project-${index}`;
            const chipStateId = `${chipLabelId}-state`;
            return (
              <button
                key={chip.slug}
                type="button"
                aria-labelledby={chipLabelId}
                aria-pressed={picked}
                aria-describedby={chipStateId}
                disabled={opening}
                className={`min-h-8 max-w-full break-words rounded-full border border-border px-3 text-sm aria-pressed:bg-accent aria-pressed:font-semibold ${focusClassName}`}
                onClick={() => dispatch(picked ? { type: "clearChip" } : { type: "pickChip", slug: chip.slug })}
              >
                <bdi id={chipLabelId}>{chip.label}</bdi>
                <span id={chipStateId} className="sr-only">{picked ? "picked" : "not picked"}</span>
              </button>
            );
          })}
        </div>
      )}
      <div className="flex flex-col items-end">
        <button
          type="button"
          disabled={!canSend}
          aria-describedby={sendReason ? reasonId : undefined}
          className={`min-h-8 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50 ${focusClassName}`}
          onClick={() => {
            if (canSend) dispatch({ type: "send" });
          }}
        >
          Send
        </button>
        <div role="status" className="text-sm text-muted-foreground">
          {sendReason && <p id={reasonId} className="mt-2">{sendReason}</p>}
        </div>
      </div>
      {state.status === "failed" && <p role="alert" dir="auto" className="text-sm">{state.reason}</p>}
    </div>
  );
}

import { Button } from "../components/ui/button.js";
import { Input } from "../components/ui/input.js";
import { textDirection } from "./text-direction.js";
import { widgetAnswer } from "./widget-answer.js";
import { widgetView, type WidgetPick, type WidgetState } from "./widget-state.js";

type Widget = Parameters<typeof widgetAnswer>[0];

type WidgetCardViewProps = {
  widget: Widget;
  state: WidgetState;
  onPick: (pick: WidgetPick) => void;
  onSend: () => void;
};

const toggleChoices = [
  { value: true, label: "Yes" },
  { value: false, label: "No" },
];

export function WidgetCardView({ widget, state, onPick, onSend }: WidgetCardViewProps) {
  const { status, label, pickedLabel, reason, canAnswer, busy } = widgetView(state);
  const value = state.status === "closed" ? undefined : state.picked?.value;
  const canSend = canAnswer && value !== undefined && widgetAnswer(widget, value).ok;
  const choices = widget.type === "select" ? widget.options.map((label) => ({ value: label, label })) : toggleChoices;

  return (
    <section
      aria-label={widget.label}
      aria-busy={busy || undefined}
      dir={textDirection(widget.label)}
      className="rounded-xl border border-border bg-card p-3 text-card-foreground"
    >
      <header>
        <p className="break-words font-medium">{widget.label}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </header>
      <p role="status" dir="auto" className="mt-2 break-words text-sm empty:mt-0">{reason}</p>
      {status === "answered" && <p dir="auto" className="mt-2 break-words text-sm">{pickedLabel}</p>}
      {(canAnswer || busy) && (
        <div className="mt-3 flex flex-col items-start gap-2">
          {widget.type === "text" || widget.type === "number" ? (
            <Input
              type={widget.type}
              step={widget.type === "number" ? "any" : undefined}
              dir="auto"
              aria-label={widget.label}
              className="focus-visible:ring-[3px] focus-visible:ring-ring/50"
              value={typeof value === "string" || typeof value === "number" ? value : ""}
              disabled={!canAnswer}
              onChange={canAnswer ? (event) => onPick({ value: event.currentTarget.value }) : undefined}
            />
          ) : (
            <div className="flex max-w-full flex-wrap gap-2">
              {choices.map((choice) => (
                <Button
                  key={choice.label}
                  type="button"
                  variant="outline"
                  dir="auto"
                  className="h-auto min-h-8 max-w-full whitespace-normal wrap-anywhere aria-pressed:border-primary aria-pressed:bg-accent"
                  aria-pressed={value === choice.value}
                  disabled={!canAnswer}
                  onClick={canAnswer ? () => onPick(choice) : undefined}
                >
                  {choice.label}
                </Button>
              ))}
            </div>
          )}
          <Button type="button" disabled={!canSend} onClick={canSend ? () => onSend() : undefined}>Send</Button>
        </div>
      )}
    </section>
  );
}

import { CheckIcon } from "lucide-react";
import { useId, type KeyboardEvent } from "react";
import type { profileSwitch } from "./profile-switch.js";
import { textDirection } from "./text-direction.js";

export interface PomeloProfileSwitcherProps {
  model: ReturnType<typeof profileSwitch>;
  onPick: (profileId: string) => void;
}

function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
  const { key, currentTarget, target } = event;
  const forward = key === "ArrowDown" || key === "ArrowRight";
  if (!forward && key !== "ArrowUp" && key !== "ArrowLeft") return;

  const radios = Array.from(currentTarget.querySelectorAll<HTMLButtonElement>('button[role="radio"]'));
  const index = radios.findIndex((radio) => radio === target);
  if (index === -1) return;

  event.preventDefault();
  const step = forward ? 1 : -1;
  radios[(index + step + radios.length) % radios.length]?.focus();
}

export function PomeloProfileSwitcher({ model, onPick }: PomeloProfileSwitcherProps) {
  const reasonPrefix = useId();
  if (model.options.length === 0) return <p>{model.emptyLine}</p>;

  const currentIndex = model.options.findIndex(({ current }) => current);
  const tabStopIndex = Math.max(0, currentIndex);

  return (
    <div role="radiogroup" aria-label="Browser profiles" className="grid gap-1" onKeyDown={moveFocus}>
      {model.options.map(({ id, label, vps, current, disabled, reason }, index) => {
        const reasonId = reason ? `${reasonPrefix}-reason-${index}` : undefined;

        return (
          <div key={id}>
            <button
              type="button"
              role="radio"
              aria-checked={current}
              aria-disabled={disabled || undefined}
              aria-describedby={reasonId}
              tabIndex={index === tabStopIndex ? 0 : -1}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-sm hover:bg-accent aria-disabled:cursor-not-allowed aria-disabled:text-muted-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              onClick={() => {
                if (!disabled) onPick(id);
              }}
            >
              <span dir={textDirection(label)} className="min-w-0 flex-1 break-words">{label}</span>
              {vps && (
                <span dir="ltr" className="shrink-0 rounded-full bg-muted px-1.5 text-xs text-muted-foreground">
                  VPS<span className="sr-only"> (Cloud browser)</span>
                </span>
              )}
              {current && <CheckIcon aria-hidden="true" className="size-4 shrink-0" />}
            </button>
            {reasonId && <p id={reasonId} className="px-2 pb-1 text-xs text-muted-foreground">{reason}</p>}
          </div>
        );
      })}
    </div>
  );
}

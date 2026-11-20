import type { CardArrival } from "./card-arrival.js";
import type { CardFailureView } from "./card-failure.js";
import { textDirection } from "./text-direction.js";

type PomeloCardStatusProps = {
  arrival?: CardArrival;
  failure?: CardFailureView;
  onRetry: () => void;
};

export function PomeloCardStatus({ arrival, failure, onRetry }: PomeloCardStatusProps) {
  if (failure && failure.state !== "ok") {
    return (
      <div dir={textDirection(failure.fallbackText)} aria-busy={failure.state === "retrying" || undefined}>
        <p>{failure.fallbackText}</p>
        {failure.state === "failed" && failure.canRetry && (
          <button
            type="button"
            dir={textDirection(failure.label)}
            onClick={() => onRetry()}
            className="cursor-pointer rounded-md bg-secondary px-3 py-1.5 text-sm font-medium text-secondary-foreground hover:bg-secondary/80 focus-visible:ring-2 focus-visible:ring-ring"
          >
            {failure.label}
          </button>
        )}
      </div>
    );
  }

  if (arrival?.state === "placeholder") {
    return <div role="status" aria-busy="true" dir={textDirection(arrival.label)}>{arrival.label}</div>;
  }

  if (arrival?.state === "fallback") {
    return <p dir={textDirection(arrival.text)}>{arrival.text}</p>;
  }

  return null;
}

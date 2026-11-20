import { tagColour } from "./tag-colour.js";
import type { TagProposal } from "./tag-suggest.js";
import { textDirection } from "./text-direction.js";

export interface PomeloTagSuggestionsProps {
  chips: readonly Readonly<TagProposal & { colour?: unknown }>[];
  onAccept: (slug: string) => void;
  onDismiss: (slug: string) => void;
}

const buttonClassName = "min-h-6 min-w-6 cursor-pointer rounded-sm px-1 hover:underline focus-visible:outline-1";

export function PomeloTagSuggestions({ chips, onAccept, onDismiss }: PomeloTagSuggestionsProps) {
  if (chips.length === 0) return null;

  return (
    <ul role="list" aria-label="Suggested projects" className="flex flex-wrap gap-2">
      {chips.map(({ slug, label, colour }) => {
        const { bg, fg } = tagColour(slug, colour);
        return (
          <li
            key={slug}
            className="flex min-w-0 flex-wrap items-center gap-1 rounded-lg px-2 py-1 text-xs"
            style={{ backgroundColor: bg, color: fg }}
          >
            <bdi dir={textDirection(label)} className="min-w-0 break-words font-medium">
              {label}
            </bdi>
            <button
              type="button"
              className={buttonClassName}
              aria-label={`Add to project ${label}`}
              onClick={() => onAccept(slug)}
            >
              Add
            </button>
            <button
              type="button"
              className={buttonClassName}
              aria-label={`Dismiss suggestion ${label}`}
              onClick={() => onDismiss(slug)}
            >
              Dismiss
            </button>
          </li>
        );
      })}
    </ul>
  );
}

import { tagColour } from "./tag-colour.js";
import { textDirection } from "./text-direction.js";

export interface PomeloRailFilterProps {
  text: string;
  chips: readonly { slug: string; label: string; colour?: unknown }[];
  pickedSlugs: readonly string[];
  shown: number;
  total: number;
  emptyNote: string | null;
  onTextChange: (text: string) => void;
  onToggleChip: (slug: string) => void;
  onClearFilters: () => void;
}

const focusClassName = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring";

export function PomeloRailFilter({
  text, chips, pickedSlugs, shown, total, emptyNote, onTextChange, onToggleChip, onClearFilters,
}: PomeloRailFilterProps) {
  // A query with only whitespace or combining marks folds to empty in the model.
  const hasFilters = pickedSlugs.length > 0 || /[^\s\p{M}]/u.test(text);

  return (
    <div>
      <input
        type="search"
        aria-label="Filter threads"
        className={`min-h-7 w-full rounded-md border border-sidebar-border bg-sidebar px-2 text-sm text-sidebar-foreground ${focusClassName}`}
        dir={textDirection(text)}
        value={text}
        onChange={(event) => onTextChange(event.currentTarget.value)}
      />
      {chips.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {chips.map(({ slug, label, colour }) => {
            const picked = pickedSlugs.includes(slug);
            const { bg, fg } = tagColour(slug, colour);

            return (
              <button
                key={slug}
                type="button"
                aria-pressed={picked}
                className={`flex min-h-7 min-w-7 max-w-full cursor-pointer flex-wrap items-center gap-x-2 rounded-md px-2 py-1 text-xs ${focusClassName}`}
                style={{ backgroundColor: bg, color: fg }}
                onClick={() => onToggleChip(slug)}
              >
                <bdi dir={textDirection(label)} className="min-w-0 break-words font-medium">{label}</bdi>
                <span aria-hidden="true">{picked ? "Picked" : "Not picked"}</span>
              </button>
            );
          })}
        </div>
      )}
      <div aria-live="polite" className="text-xs text-sidebar-foreground">
        {hasFilters && <p className="mt-2">Showing {shown} of {total} threads</p>}
        {emptyNote !== null && <p className="mt-2">{emptyNote}</p>}
      </div>
      {hasFilters && (
        <button
          type="button"
          className={`mt-2 min-h-7 cursor-pointer rounded-md px-2 text-xs text-sidebar-foreground underline ${focusClassName}`}
          onClick={onClearFilters}
        >
          Clear filters
        </button>
      )}
    </div>
  );
}

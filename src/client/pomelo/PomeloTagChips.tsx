import { fitTagChips } from "./chip-overflow.js";
import { tagColour } from "./tag-colour.js";
import { textDirection } from "./text-direction.js";

export interface PomeloTagChipsProps {
  tags: unknown;
  labels?: Readonly<Record<string, string | undefined>>;
  colours?: Readonly<Record<string, string | undefined>>;
  maxChips: number;
}

const chipClass = "max-w-full rounded-full px-2 py-0.5 text-xs font-medium [overflow-wrap:anywhere]";

export function PomeloTagChips({ tags, labels, colours, maxChips }: PomeloTagChipsProps) {
  // The list wraps, so the chip limit needn't shorten individual project names.
  const maxChars = Number.MAX_SAFE_INTEGER;
  const { shown, hiddenCount, moreLabel } = fitTagChips(tags, { maxChips, maxChars });
  if (!shown.length && !hiddenCount) return null;

  const projectLabel = (tag: string, fallback: string) =>
    (labels && Object.hasOwn(labels, tag) ? labels[tag] : undefined) ?? fallback;

  const moreText = `${moreLabel} more`;
  const { bg: moreBg, fg: moreFg } = tagColour("more");
  const hiddenNames = hiddenCount
    ? fitTagChips(tags, { maxChips: shown.length + hiddenCount, maxChars }).shown
        .slice(shown.length)
        .map(({ tag, label }) => projectLabel(tag, label))
        .join(", ")
    : "";

  return (
    <ul role="list" className="flex list-none flex-wrap items-center gap-1">
      {shown.map(({ tag, label }) => {
        const name = projectLabel(tag, label);
        const { bg, fg } = tagColour(tag, colours?.[tag]);
        return (
          <li key={tag} dir={textDirection(name)} className={chipClass} style={{ backgroundColor: bg, color: fg }}>
            {name}
          </li>
        );
      })}
      {hiddenCount > 0 && (
        <li
          aria-label={`${moreText}: ${hiddenNames}`}
          className={chipClass}
          style={{ backgroundColor: moreBg, color: moreFg }}
          dir={textDirection(moreText)}
        >
          {moreText}
        </li>
      )}
    </ul>
  );
}

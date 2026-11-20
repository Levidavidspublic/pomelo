import { Check } from "lucide-react";
import { Button } from "../components/ui/button.js";
import { Input } from "../components/ui/input.js";
import { projectPicker, type ProjectPickerTag } from "./project-picker.js";
import { tagColour } from "./tag-colour.js";

type PomeloProjectPickerProps = {
  tags: readonly Readonly<ProjectPickerTag>[];
  threadTagSlugs: readonly string[];
  query: string;
  onQuery: (query: string) => void;
  onToggle: (slug: string) => void;
  onCreate: (name: string) => void;
};

export function PomeloProjectPicker({
  tags, threadTagSlugs, query, onQuery, onToggle, onCreate,
}: PomeloProjectPickerProps) {
  const { rows, canCreate, emptyNote } = projectPicker(tags, threadTagSlugs, query);
  const name = query.trim();

  return (
    <div className="flex flex-col gap-2">
      <Input
        type="search"
        aria-label="Search projects"
        dir="auto"
        value={query}
        onChange={(event) => onQuery(event.currentTarget.value)}
        className="transition-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />
      {rows.length > 0 && (
        <ul role="listbox" aria-label="Projects" aria-multiselectable="true">
          {rows.map((row) => (
            <li key={row.slug} role="option" aria-selected={row.ticked}>
              <Button
                type="button"
                variant="ghost"
                aria-pressed={row.ticked}
                onClick={() => onToggle(row.slug)}
                className="h-auto min-h-8 w-full flex-wrap justify-start whitespace-normal text-start transition-none"
              >
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: tagColour(row.slug, row.colour).bg }}
                />
                <span dir="auto" className="min-w-0 wrap-anywhere">{row.name}</span>
                {row.ticked && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Check aria-hidden="true" />
                    On this thread
                  </span>
                )}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {emptyNote && <p className="text-sm text-muted-foreground">{emptyNote}</p>}
      {canCreate && (
        <Button
          type="button"
          variant="outline"
          dir="auto"
          onClick={() => onCreate(name)}
          className="h-auto min-h-8 whitespace-normal wrap-anywhere text-start transition-none"
        >
          {`Make new project "${name}"`}
        </Button>
      )}
    </div>
  );
}

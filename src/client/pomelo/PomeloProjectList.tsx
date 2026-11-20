import { useId } from "react";
import type { ProjectListAction, ProjectListResult, ProjectListRow } from "./project-list.js";
import { tagColour } from "./tag-colour.js";

export interface PomeloProjectListProps {
  result: ProjectListResult;
  onAction?: (slug: string, actionId: ProjectListAction["id"]) => void;
}

function threadCountText({ threadCount, liveThreadCount }: ProjectListRow): string {
  if (threadCount === 0) return "No threads";
  const total = threadCount === 1 ? "1 thread" : `${threadCount} threads`;
  return liveThreadCount === threadCount ? total : `${total}, ${liveThreadCount} not put away`;
}

export function PomeloProjectList({ result, onAction }: PomeloProjectListProps) {
  const listId = useId();
  if (result.rows.length === 0) return <p>{result.emptyText}</p>;

  return (
    <ul role="list" className="grid list-none gap-3">
      {result.rows.map((row, index) => {
        const { slug, name, dir, colour, archived, actions } = row;
        const { bg } = tagColour(slug, colour);
        const nameId = `${listId}-project-${index}`;

        return (
          <li key={slug} className="grid gap-2 rounded-md border border-border p-3">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ backgroundColor: bg }} />
              <bdi id={nameId} dir={dir} className="font-medium [overflow-wrap:anywhere]">{name}</bdi>
              <span dir="ltr" className="text-sm text-muted-foreground">{threadCountText(row)}</span>
              {archived && <span className="text-sm text-muted-foreground">Put away</span>}
            </div>
            <div role="group" aria-labelledby={nameId} className="flex flex-wrap items-start gap-2">
              {actions.map(({ id, label, enabled, reason }) => {
                const reasonId = !enabled && reason ? `${nameId}-${id}-reason` : undefined;

                return (
                  <div key={id}>
                    <button
                      type="button"
                      aria-disabled={!enabled || undefined}
                      aria-describedby={reasonId}
                      className="min-h-8 cursor-pointer rounded-md border border-border px-2 text-sm hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring aria-disabled:cursor-not-allowed aria-disabled:text-muted-foreground"
                      onClick={enabled ? () => onAction?.(slug, id) : undefined}
                    >
                      {label}
                    </button>
                    {reasonId && <p id={reasonId} className="mt-1 text-sm text-muted-foreground">{reason}</p>}
                  </div>
                );
              })}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

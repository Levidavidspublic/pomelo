import { textDirection } from "./text-direction.js";
import { makeThreadLink } from "./thread-link.js";
import type { ThreadOriginResult } from "./thread-origin.js";

type PomeloThreadOriginProps = {
  origin: ThreadOriginResult;
  onOpenParent: (threadId: string) => void;
};

export function PomeloThreadOrigin({ origin, onOpenParent }: PomeloThreadOriginProps) {
  const { openedByLabel, parent, note } = origin;
  if (openedByLabel === null) return null;

  return (
    <div role="group" aria-label="Thread origin" dir="ltr" className="text-sm text-muted-foreground">
      {openedByLabel}
      {note ? `, ${note}` : parent && (
        <>
          {", from "}
          <a
            href={makeThreadLink({ threadId: parent.sid })}
            className="underline"
            onClick={(event) => {
              if (event.defaultPrevented || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
              event.preventDefault();
              onOpenParent(parent.sid);
            }}
          >
            <bdi dir={textDirection(parent.title)}>{parent.title}</bdi>
          </a>
        </>
      )}
    </div>
  );
}

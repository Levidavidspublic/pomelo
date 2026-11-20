import { textDirection } from "./text-direction.js";
import { makeThreadLink } from "./thread-link.js";
import type { ThreadNotice } from "./thread-notice-model.js";

export interface PomeloThreadNoticeProps {
  notices: readonly ThreadNotice[];
  onOpen: (threadId: string) => void;
  onDismiss: (threadId: string) => void;
}

function threadHref(threadId: string): string | undefined {
  try {
    return makeThreadLink({ threadId });
  } catch (error) {
    // The notice model accepts IDs that cannot be represented by a thread link.
    if (!(error instanceof TypeError)) throw error;
    return undefined;
  }
}

export function PomeloThreadNotice({ notices, onOpen, onDismiss }: PomeloThreadNoticeProps) {
  if (!notices.length) return null;

  return (
    <div role="status" aria-live="polite" aria-atomic="false">
      <ul role="list" className="m-0 list-none p-0 text-sm text-[var(--text-muted)]">
        {notices.map(({ threadId, title, openedBy }) => {
          const href = threadHref(threadId);
          const titleText = <bdi dir={textDirection(title)}>{title}</bdi>;

          return (
            <li key={threadId} className="flex items-baseline gap-2 py-1">
              <span className="min-w-0 wrap-anywhere" dir="ltr">
                <bdi dir="auto">{openedBy}</bdi> opened a thread{" "}
                {href ? (
                  <a
                    href={href}
                    className="text-[var(--ink)] underline underline-offset-2"
                    onClick={(event) => {
                      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
                      event.preventDefault();
                      onOpen(threadId);
                    }}
                  >
                    {titleText}
                  </a>
                ) : titleText}
              </span>
              <button
                type="button"
                className="min-h-6 shrink-0 cursor-pointer rounded px-2 hover:underline"
                aria-label={`Dismiss ${title}`}
                onClick={() => onDismiss(threadId)}
              >
                Dismiss
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

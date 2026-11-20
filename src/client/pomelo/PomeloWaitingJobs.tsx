import { makeThreadLink, type ThreadLinkTarget } from "./thread-link.js";
import type { waitingJobs } from "./waiting-jobs.js";

export interface PomeloWaitingJobsProps {
  summary: ReturnType<typeof waitingJobs>;
  onOpen: (target: ThreadLinkTarget) => void;
}

function threadHref(target: ThreadLinkTarget): string | undefined {
  try {
    return makeThreadLink(target);
  } catch (error) {
    // The summary accepts nonempty IDs, while thread links require a narrower format.
    if (!(error instanceof TypeError)) throw error;
    return undefined;
  }
}

export function PomeloWaitingJobs({ summary, onOpen }: PomeloWaitingJobsProps) {
  if (summary.total === 0) return null;

  return (
    <section className="space-y-2 text-sm">
      <h2 className="font-medium">
        {`${summary.total} browser ${summary.total === 1 ? "job" : "jobs"} waiting for you`}
      </h2>
      <ul className="space-y-1" role="list">
        {summary.groups.flatMap(({ label, jobs }) => jobs.map(({ id, threadId }) => {
          const target: ThreadLinkTarget = { threadId, panel: "browser" };
          const href = threadHref(target);
          return (
            <li key={id}>
              <span>{label}</span>
              {href && (
                <a
                  className="ms-2 underline underline-offset-2"
                  href={href}
                  onClick={(event) => {
                    if (event.defaultPrevented || event.button !== 0 ||
                        event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                    event.preventDefault();
                    onOpen(target);
                  }}
                >
                  Open thread
                </a>
              )}
            </li>
          );
        }))}
      </ul>
    </section>
  );
}

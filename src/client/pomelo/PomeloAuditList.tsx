import { Button } from "../components/ui/button.js";
import type { auditList } from "./audit-list.js";
import { textDirection } from "./text-direction.js";

type PomeloAuditListProps = {
  list: ReturnType<typeof auditList>;
  formatTime: (at: number) => string;
  onMore: () => void;
};

export function PomeloAuditList({ list, formatTime, onMore }: PomeloAuditListProps) {
  return (
    <div className="space-y-3 text-sm">
      {list.empty !== null ? (
        <p className="m-0 text-muted-foreground">{list.empty}</p>
      ) : (
        <ol role="list" className="m-0 list-none divide-y divide-border p-0">
          {list.rows.map(({ label, site, refLabel, jobId, at }, index) => (
            <li
              key={index}
              dir={textDirection(refLabel ?? label)}
              className="py-2 text-start [overflow-wrap:anywhere]"
            >
              <bdi className="font-medium">{label}</bdi>
              {site !== undefined && <> <bdi dir="ltr">{site}</bdi></>}
              {refLabel !== undefined && <> <bdi>{refLabel}</bdi></>}
              {jobId !== undefined && <> <bdi dir="ltr">{jobId}</bdi></>}
              {" "}
              <bdi className="text-muted-foreground">
                {at === null ? "time unknown" : (
                  <time dateTime={new Date(at).toISOString()}>{formatTime(at)}</time>
                )}
              </bdi>
            </li>
          ))}
        </ol>
      )}
      {list.more && (
        <Button type="button" variant="outline" size="sm" onClick={onMore}>Show more</Button>
      )}
    </div>
  );
}

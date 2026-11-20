import { Button } from "../components/ui/button.js";
import { approvalCardView, type ApprovalRequest } from "./approval-card.js";

type PomeloApprovalCardProps = {
  request: ApprovalRequest;
  now: number;
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
  onEdit: (id: string) => void;
};

const toneClasses = {
  good: "text-[var(--green)]",
  warn: "text-[var(--amber)]",
  bad: "text-[var(--red)]",
  neutral: "text-card-foreground",
};

export function PomeloApprovalCard({ request, now, onApprove, onDeny, onEdit }: PomeloApprovalCardProps) {
  const { headline, lines, buttons, status, tone } = approvalCardView(request, now);
  const callbacks = { Approve: onApprove, Deny: onDeny, Edit: onEdit };

  return (
    <article
      className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-3 text-card-foreground"
      data-status={status}
      data-tone={tone}
    >
      <p className={`m-0 font-semibold ${toneClasses[tone]}`} role="status">{headline}</p>
      <dl className="m-0 space-y-1 text-sm">
        {lines.map(({ label, text }) => (
          <div key={label} className="grid grid-cols-[5rem_minmax(0,1fr)] gap-2">
            <dt className="font-medium">{label}</dt>
            <dd className="m-0 text-start [overflow-wrap:anywhere]" dir={label === "Account" || label === "Change" ? "auto" : undefined}>
              {text}
            </dd>
          </div>
        ))}
      </dl>
      {buttons.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {buttons.map((button) => (
            <Button
              key={button}
              type="button"
              variant={button === "Approve" ? "default" : "outline"}
              onClick={() => callbacks[button](request.id)}
            >
              {button}
            </Button>
          ))}
        </div>
      )}
    </article>
  );
}

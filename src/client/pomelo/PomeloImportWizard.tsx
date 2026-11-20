import { useId } from "react";
import { Button } from "../components/ui/button.js";
import type { importWizard } from "./import-wizard.js";

type PomeloImportWizardProps = {
  model: ReturnType<typeof importWizard>;
  onNext: () => void;
  onClose: () => void;
};

const stepLabels = {
  complete: "Done",
  current: "Now",
  upcoming: "Later",
};

const resultTones = {
  good: { label: "Success", className: "text-[var(--green)]" },
  warn: { label: "Warning", className: "text-[var(--amber)]" },
  bad: { label: "Error", className: "text-[var(--red)]" },
};

export function PomeloImportWizard({ model, onNext, onClose }: PomeloImportWizardProps) {
  const headingId = useId();
  const reasonId = model.blockedReason ? `${headingId}-reason` : undefined;

  return (
    <section aria-labelledby={headingId} className="flex min-w-0 flex-col gap-3 text-start">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h3 id={headingId} className="text-sm font-semibold">Chrome import</h3>
        {model.vps && <span className="text-xs text-muted-foreground" dir="ltr">VPS</span>}
      </div>
      <ol aria-label="Import steps" className="list-dec space-y-1 ps-5 text-sm">
        {model.steps.map(({ id, label, state }) => (
          <li key={id} aria-current={state === "current" ? "step" : undefined}>
            <div className="flex flex-wrap justify-between gap-x-3">
              <span dir="auto" className="min-w-0 [overflow-wrap:anywhere]">{label}</span>
              <span className={state === "current" ? "font-semibold" : "text-muted-foreground"}>
                {stepLabels[state]}
              </span>
            </div>
          </li>
        ))}
      </ol>
      {model.blockedReason && (
        <p id={reasonId} dir="auto" className="text-sm text-muted-foreground">{model.blockedReason}</p>
      )}
      <p role="status" dir="auto" className="text-sm font-semibold empty:absolute">{model.headline}</p>
      {model.step === "results" && model.rows.length > 0 && (
        <ul aria-label="Site results" role="list" className="divide-y divide-border text-sm">
          {model.rows.map(({ site, label, tone }, index) => (
            <li key={`${site}-${index}`} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2">
              <bdi dir="auto" className="min-w-0 [overflow-wrap:anywhere]">{site}</bdi>
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span dir="auto">{label}</span>
                <span className={`text-xs font-medium ${resultTones[tone].className}`}>
                  {resultTones[tone].label}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        {model.nextLabel && (
          <Button type="button" disabled={!model.canNext} aria-describedby={reasonId} onClick={onNext}>
            {model.nextLabel}
          </Button>
        )}
        <Button type="button" variant="outline" onClick={onClose}>Close</Button>
      </div>
    </section>
  );
}

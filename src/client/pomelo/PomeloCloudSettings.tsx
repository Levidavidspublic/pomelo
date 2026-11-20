import { Button } from "../components/ui/button.js";
import { cloudSettings } from "./cloud-settings.js";

type PomeloCloudSettingsProps = Parameters<typeof cloudSettings>[0] & {
  onCheckAgain: () => void;
};

function summaryLine({ status, rows }: ReturnType<typeof cloudSettings>): string {
  if (status === "not-set-up") return "VPS browser is not set up.";
  if (status === "needs-fixing") return "Cloud browser setup needs fixing.";
  if (rows.some((row) => row.status === "reachable")) return "VPS browser is set up and reachable.";
  if (rows.some((row) => row.status === "slow")) return "VPS browser is set up. The connection is slow.";
  return "VPS browser is set up. VPS not reachable.";
}

export function PomeloCloudSettings({ profiles, reachByProfileId, now, onCheckAgain }: PomeloCloudSettingsProps) {
  const model = cloudSettings({ profiles, reachByProfileId, now });

  return (
    <section className="space-y-2 text-sm">
      <h2 className="font-medium">{model.title}</h2>
      <p role="status">{summaryLine(model)}</p>
      {model.nextStep ? (
        <p>{model.nextStep}</p>
      ) : (
        <ul className="space-y-2" role="list">
          {model.rows.map(({ name, cdpUrlName, label, lastSeen }, index) => (
            <li key={index} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <bdi dir="auto" className="break-words font-medium">{name}</bdi>{" "}
              {cdpUrlName && <><code dir="ltr" className="break-all">{cdpUrlName}</code>{" "}</>}
              <span>{label}</span>{" "}
              <span>{lastSeen}</span>
            </li>
          ))}
        </ul>
      )}
      <Button type="button" variant="outline" className="transition-none" onClick={onCheckAgain}>
        Check again
      </Button>
    </section>
  );
}

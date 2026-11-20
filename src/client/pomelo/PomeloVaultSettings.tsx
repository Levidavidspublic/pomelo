import { textDirection } from "./text-direction.js";
import type { vaultSettings } from "./vault-settings.js";

export interface PomeloVaultSettingsProps {
  settings: ReturnType<typeof vaultSettings>;
}

export function PomeloVaultSettings({ settings: { link, refs } }: PomeloVaultSettingsProps) {
  return (
    <section className="space-y-2 text-sm">
      <h2 className="font-medium">1Password</h2>
      <p dir="ltr" role="status">
        <strong>{link.status}</strong>{" "}
        <span className="text-muted-foreground">{link.label}</span>
      </p>
      {link.status === "LOCKED" && (
        <p className="text-muted-foreground">Unlock 1Password on this computer.</p>
      )}
      {refs.length === 0 ? (
        <p className="text-muted-foreground">No saved references.</p>
      ) : (
        <ul className="space-y-2" role="list" aria-label="Saved references">
          {refs.map(({ id, label, origins }, index) => (
            <li key={`${id}-${index}`} dir={/\p{Script=Hebrew}/u.test(label) ? "rtl" : textDirection(label)}>
              <p className="font-medium [overflow-wrap:anywhere]">{label}</p>
              {origins.length > 0 && (
                <p className="text-muted-foreground [overflow-wrap:anywhere]" dir="ltr">{origins.join(", ")}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

import { useId } from "react";
import { Button } from "../components/ui/button.js";
import { textDirection } from "./text-direction.js";
import type { ThreadMenuItem } from "./thread-menu.js";

type PomeloThreadMenuProps = {
  items: ThreadMenuItem[];
  onAction: (id: ThreadMenuItem["id"]) => void;
};

export function PomeloThreadMenu({ items, onAction }: PomeloThreadMenuProps) {
  const menuId = useId();
  if (items.length === 0) return null;

  return (
    <div role="menu" aria-label="Thread actions">
      {items.map((item) => {
        const reason = item.enabled ? undefined : item.reason;
        const reasonId = reason ? `${menuId}-${item.id}-reason` : undefined;
        return (
          <div key={item.id} role="none">
            <Button
              type="button"
              role="menuitem"
              variant="ghost"
              className="h-auto min-h-8 w-full justify-start whitespace-normal text-start"
              dir={textDirection(item.label)}
              aria-disabled={!item.enabled || undefined}
              aria-describedby={reasonId}
              onClick={() => {
                if (item.enabled) onAction(item.id);
              }}
            >
              {item.label}
              {item.danger && <> <span dir="ltr" lang="en" className="text-xs font-semibold">Warning</span></>}
            </Button>
            {reason && (
              <p id={reasonId} dir={textDirection(reason)} className="px-3.5 text-start text-sm text-muted-foreground">
                {reason}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

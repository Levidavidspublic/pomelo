import type { KeyboardEvent } from "react";
import { resizeByKey, separatorProps } from "./panel-resize.js";
import { nextPanel, SIDE_PANELS, type SidePanel } from "./side-panel.js";

type Direction = "ltr" | "rtl";

type PomeloPanelTabsProps = {
  available: readonly SidePanel[];
  active: SidePanel | null;
  width: number;
  viewport: number;
  dir: Direction;
  onSelect: (panel: SidePanel) => void;
  onResize: (width: number) => void;
};

const labels: Record<SidePanel, string> = {
  browser: "Browser",
  artifact: "Artifact",
  work: "Work",
};

const openingEvents = {
  browser: "job-started",
  artifact: "card-tapped",
  work: "subagent-tapped",
} satisfies Record<SidePanel, Parameters<typeof nextPanel>[1]>;

function orderedPanels(available: readonly SidePanel[]) {
  return SIDE_PANELS.filter((panel) => available.includes(panel));
}

export function tabKeyTarget(key: string, active: SidePanel | null, available: readonly SidePanel[], dir: Direction): SidePanel | null {
  const panels = orderedPanels(available);
  const current = active === null ? -1 : panels.indexOf(active);
  const forward = dir === "rtl" ? "ArrowLeft" : "ArrowRight";
  const backward = dir === "rtl" ? "ArrowRight" : "ArrowLeft";

  let target: SidePanel | undefined;
  if (key === "Home") {
    target = panels[0];
  } else if (key === "End") {
    target = panels.at(-1);
  } else if (key === forward || key === "ArrowDown") {
    target = panels[current + 1] ?? panels[0];
  } else if (key === backward || key === "ArrowUp") {
    target = current > 0 ? panels[current - 1] : panels.at(-1);
  }

  return target === undefined ? null : nextPanel(active, openingEvents[target], available);
}

export function PomeloPanelTabs({ available, active, width, viewport, dir, onSelect, onResize }: PomeloPanelTabsProps) {
  const panels = orderedPanels(available);
  if (panels.length === 0) return null;

  function handleTabKey(event: KeyboardEvent<HTMLButtonElement>, panel: SidePanel) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const target = tabKeyTarget(event.key, panel, available, dir);
    if (target === null) return;

    event.preventDefault();
    const list = event.currentTarget.closest('[role="tablist"]');
    list?.querySelector<HTMLButtonElement>(`[data-panel="${target}"]`)?.focus();
    if (target !== active) onSelect(target);
  }

  return (
    <div className="relative" dir={dir} lang="en">
      <div
        className="resizer"
        style={{ display: "block", left: "auto", insetInlineStart: -4 }}
        {...separatorProps(width, viewport)}
        aria-label="Resize side panel"
        onKeyDown={(event) => {
          const nextWidth = resizeByKey(width, event.key, { viewport, dir, shift: event.shiftKey });
          if (nextWidth === null) return;
          event.preventDefault();
          onResize(nextWidth);
        }}
      />
      <div className="bench-tabrow" role="tablist" aria-label="Side panel">
        {panels.map((panel) => {
          const selected = panel === active;
          return (
            <span key={panel} className={selected ? "bench-tab on" : "bench-tab"}>
              <button
                type="button"
                className="bench-tab-btn"
                role="tab"
                data-panel={panel}
                aria-selected={selected}
                aria-description={selected ? "Open panel" : undefined}
                tabIndex={selected ? 0 : -1}
                onClick={() => onSelect(panel)}
                onKeyDown={(event) => handleTabKey(event, panel)}
              >
                {labels[panel]}
              </button>
            </span>
          );
        })}
      </div>
    </div>
  );
}

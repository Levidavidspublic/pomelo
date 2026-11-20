import type { narrowLayout } from "./narrow-layout.js";

type NarrowLayout = ReturnType<typeof narrowLayout>;
type View = NarrowLayout["focus"];

export interface PomeloNarrowNavProps {
  layout: NarrowLayout;
  /** Each destination is available when the model returns it as the focus for that request. */
  availability: Pick<NarrowLayout["show"], "chat" | "panel">;
  onShow: (view: View) => void;
  dir?: "ltr" | "rtl";
}

const views = ["rail", "chat", "panel"] as const;
const labels: Record<View, string> = { rail: "Threads", chat: "Chat", panel: "Panel" };

export function PomeloNarrowNav({ layout, availability, onShow, dir }: PomeloNarrowNavProps) {
  if (!layout.narrow) return null;

  const threadRequired = availability.chat ? undefined : "Open a thread first.";
  const disabledReasons = {
    rail: undefined,
    chat: threadRequired,
    panel: availability.panel ? undefined : threadRequired ?? "No side panel is open.",
  };

  return (
    <nav
      aria-label="Workspace views"
      dir={dir}
      lang="en"
      className="flex flex-wrap items-center gap-1 border-b border-sidebar-border bg-sidebar px-2 py-1 text-sidebar-foreground"
    >
      {views.map((view) => {
        const current = layout.show[view];
        const reason = disabledReasons[view];
        const label = view === "chat" && !current ? "Back to chat" : labels[view];

        return (
          <button
            key={view}
            type="button"
            aria-current={current ? "page" : undefined}
            disabled={reason !== undefined}
            title={reason}
            onClick={reason === undefined ? () => onShow(view) : undefined}
            className="min-h-11 min-w-11 rounded-md px-2 text-sm enabled:cursor-pointer enabled:hover:bg-sidebar-accent enabled:hover:text-sidebar-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring disabled:opacity-60 aria-[current=page]:bg-sidebar-accent aria-[current=page]:font-medium aria-[current=page]:text-sidebar-accent-foreground"
          >
            {label}
            {reason && <span className="sr-only"> {reason}</span>}
          </button>
        );
      })}
      <span role="status" className="ms-auto text-xs">Showing {labels[layout.focus]}</span>
    </nav>
  );
}

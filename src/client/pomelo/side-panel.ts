export const SIDE_PANELS = Object.freeze(["browser", "artifact", "work"] as const);
export type SidePanel = (typeof SIDE_PANELS)[number];

const panelForEvent = {
  "card-tapped": "artifact",
  "job-started": "browser",
  "subagent-tapped": "work",
} satisfies Record<string, SidePanel>;

export function parseSavedPanel(raw: string | null): SidePanel | null {
  return SIDE_PANELS.find((panel) => panel === raw) ?? null;
}

export function savedPanel(panel: SidePanel): string {
  return panel;
}

export function openingPanel(input: { saved: string | null; available: readonly SidePanel[] }): SidePanel | null {
  const { saved, available } = input;
  const preferred = parseSavedPanel(saved);
  if (preferred !== null && available.includes(preferred)) return preferred;
  return SIDE_PANELS.find((panel) => available.includes(panel)) ?? null;
}

export function nextPanel(
  current: SidePanel | null,
  event: keyof typeof panelForEvent,
  available: readonly SidePanel[],
): SidePanel | null {
  const requested = panelForEvent[event];
  return available.includes(requested) ? requested : current;
}

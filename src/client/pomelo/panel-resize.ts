const MIN_PANEL_WIDTH = 320;
const MIN_CHAT_WIDTH = 480;

type ResizeOptions = { viewport: number; dir: "ltr" | "rtl" };

function maxPanelWidth(viewport: number): number {
  return Math.max(MIN_PANEL_WIDTH, viewport - MIN_CHAT_WIDTH);
}

export function clampWidth(width: number, viewport: number): number {
  return Math.min(maxPanelWidth(viewport), Math.max(MIN_PANEL_WIDTH, width));
}

export function resizeByKey(width: number, key: string, options: ResizeOptions & { shift: boolean }): number | null {
  switch (key) {
    case "Home":
      return MIN_PANEL_WIDTH;
    case "End":
      return maxPanelWidth(options.viewport);
    case "ArrowLeft":
    case "ArrowRight": {
      const step = options.shift ? 64 : 16;
      return resizeByDrag(width, key === "ArrowLeft" ? -step : step, options);
    }
    default:
      return null;
  }
}

/** deltaX is the current pointer X minus its starting X. */
export function resizeByDrag(startWidth: number, deltaX: number, { viewport, dir }: ResizeOptions): number {
  const change = dir === "ltr" ? -deltaX : deltaX;
  return clampWidth(startWidth + change, viewport);
}

export function parseSavedWidth(raw: string | null): number | null {
  const width = Number(raw);
  return Number.isFinite(width) && width >= 1 ? Math.round(width) : null;
}

export function separatorProps(width: number, viewport: number) {
  return {
    role: "separator",
    "aria-orientation": "vertical",
    "aria-valuemin": MIN_PANEL_WIDTH,
    "aria-valuemax": maxPanelWidth(viewport),
    "aria-valuenow": clampWidth(width, viewport),
    tabIndex: 0,
  } as const;
}

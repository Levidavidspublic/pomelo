import { motionFor } from "./motion.js";

export type DiagramView = { scale: number; x: number; y: number };

type Size = { width: number; height: number };
export type DiagramGeometry = { frame: Size; diagram: Size };
export type ViewLimits = { minScale?: number; maxScale?: number };

type ViewCommand =
  | { type: "zoom-in" | "zoom-out" | "reset" }
  | { type: "zoom-at"; factor: number; x: number; y: number }
  | { type: "pan"; dx: number; dy: number };

export type ViewAction = ViewCommand | { type: "key"; key: string; shiftKey?: boolean };

const DEFAULT_LIMITS = { minScale: 0.25, maxScale: 4 };
const ZOOM_STEP = 1.25;
const PAN_STEP = 32;
const MIN_VISIBLE = 24;

// The keys follow screen coordinates in both LTR and RTL.
const KEY_COMMANDS = new Map<string, ViewCommand>([
  ["ArrowLeft", { type: "pan", dx: -1, dy: 0 }],
  ["ArrowRight", { type: "pan", dx: 1, dy: 0 }],
  ["ArrowUp", { type: "pan", dx: 0, dy: -1 }],
  ["ArrowDown", { type: "pan", dx: 0, dy: 1 }],
  ["+", { type: "zoom-in" }],
  ["-", { type: "zoom-out" }],
  ["0", { type: "reset" }],
]);

function positive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function validSize({ width, height }: Size): boolean {
  return positive(width) && positive(height);
}

function validView({ scale, x, y }: DiagramView): boolean {
  return positive(scale) && Number.isFinite(x) && Number.isFinite(y);
}

function scaleLimits({ minScale = DEFAULT_LIMITS.minScale, maxScale = DEFAULT_LIMITS.maxScale }: ViewLimits) {
  if (positive(minScale) && positive(maxScale) && minScale <= maxScale) return { minScale, maxScale };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampOffset(offset: number, frameSize: number, scaledSize: number): number {
  const visible = Math.min(MIN_VISIBLE, frameSize, scaledSize);
  return clamp(offset, visible - scaledSize, frameSize - visible);
}

/** Center the diagram at the scale that fits inside the frame, subject to the scale limits. */
export function fitView({ frame, diagram }: DiagramGeometry, limits: ViewLimits = {}): DiagramView {
  const { minScale, maxScale } = scaleLimits(limits) ?? DEFAULT_LIMITS;
  const fallback = { scale: clamp(1, minScale, maxScale), x: 0, y: 0 };
  if (!validSize(frame) || !validSize(diagram)) return fallback;

  const scale = clamp(Math.min(frame.width / diagram.width, frame.height / diagram.height), minScale, maxScale);
  const width = diagram.width * scale;
  const height = diagram.height * scale;
  if (!validSize({ width, height })) return fallback;
  return { scale, x: (frame.width - width) / 2, y: (frame.height - height) / 2 };
}

/** Coordinates and pan deltas are in frame pixels, measured from the physical top-left corner. */
export function applyViewAction(
  view: DiagramView,
  action: ViewAction,
  geometry: DiagramGeometry,
  limits: ViewLimits = {},
): DiagramView {
  const { frame, diagram } = geometry;
  const bounds = scaleLimits(limits);
  if (!bounds || !validSize(frame) || !validSize(diagram) || !validView(view)) return fitView(geometry, limits);

  let command: ViewCommand;
  if (action.type === "key") {
    const keyCommand = KEY_COMMANDS.get(action.key);
    if (!keyCommand) return view;
    const step = action.shiftKey ? PAN_STEP * 3 : PAN_STEP;
    command = keyCommand.type === "pan"
      ? { type: "pan", dx: keyCommand.dx * step, dy: keyCommand.dy * step }
      : keyCommand;
  } else {
    command = action;
  }
  if (command.type === "reset") return fitView(geometry, limits);

  const { minScale, maxScale } = bounds;
  let next: DiagramView;
  if (command.type === "pan") {
    next = { scale: clamp(view.scale, minScale, maxScale), x: view.x + command.dx, y: view.y + command.dy };
  } else {
    const point = command.type === "zoom-at" ? command : {
      x: frame.width / 2,
      y: frame.height / 2,
      factor: command.type === "zoom-in" ? ZOOM_STEP : 1 / ZOOM_STEP,
    };
    if (!positive(point.factor) || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return fitView(geometry, limits);

    const scale = clamp(view.scale * point.factor, minScale, maxScale);
    const ratio = scale / view.scale;
    next = ratio === 1 ? view : {
      scale,
      x: point.x - (point.x - view.x) * ratio,
      y: point.y - (point.y - view.y) * ratio,
    };
  }

  const width = diagram.width * next.scale;
  const height = diagram.height * next.scale;
  if (!validView(next) || !validSize({ width, height })) return fitView(geometry, limits);
  return {
    scale: next.scale,
    x: clampOffset(next.x, frame.width, width),
    y: clampOffset(next.y, frame.height, height),
  };
}

/** Apply to a diagram positioned at the frame's physical top-left corner. */
export function viewStyle(view: DiagramView, { reducedMotion = false } = {}) {
  const { scale, x, y } = validView(view) ? view : { scale: 1, x: 0, y: 0 };
  const { durationMs } = motionFor("diagram-view", { reducedMotion });
  return {
    transform: `translate(${x}px, ${y}px) scale(${scale})`,
    transformOrigin: "0 0",
    transition: durationMs ? `transform ${durationMs}ms ease-out` : "none",
    label: `Zoom ${Math.round(scale * 100)}%`,
  };
}

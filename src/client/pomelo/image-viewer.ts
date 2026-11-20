import type { ImageSourceCheck } from "./image-source.js";

export type ViewerSize = { readonly width?: number; readonly height?: number };

export type ViewerPicture = ViewerSize & {
  readonly id: string;
  readonly source: ImageSourceCheck;
};

export type ViewerCard = ViewerPicture & {
  /** Pictures from this reply, including this card, in display order. */
  readonly replyPictures?: readonly ViewerPicture[];
  readonly viewport?: ViewerSize;
};

export type ViewablePicture = ViewerSize & {
  readonly id: string;
  readonly src: string;
  readonly alt: string;
};

export type ViewerState = {
  readonly open: true;
  readonly openerCardId: string;
  readonly pictures: readonly ViewablePicture[];
  readonly index: number;
  readonly viewport?: ViewerSize;
  readonly fitScale: number;
  /** Multiplier of fitScale. At fit, zoom is 1. */
  readonly zoom: number;
  /** Offset from the centered position in viewport pixels. */
  readonly x: number;
  readonly y: number;
};

export type ViewerFallback = { open: false; showLink: true };
export type ViewerClosed = { closed: true; focusCardId: string };

export type ViewerAction =
  | { type: "zoom-in" | "zoom-out" | "reset" | "next" | "previous" | "close" }
  | { type: "pan"; dx: number; dy: number };

const FIT = { zoom: 1, x: 0, y: 0 };
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;
const PAN_STEP = 32;
const MIN_VISIBLE = 24;

function positive(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value > 0;
}

function hasSize(size: ViewerSize | undefined): size is Required<ViewerSize> {
  return !!size && positive(size.width) && positive(size.height);
}

function fitScale(picture: ViewablePicture, viewport: ViewerSize | undefined): number {
  if (!hasSize(picture) || !hasSize(viewport)) return 1;
  const scale = Math.min(1, viewport.width / picture.width, viewport.height / picture.height);
  return Math.max(Number.MIN_VALUE, scale);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampOffset(offset: number, viewportSize: number, fittedSize: number, zoom: number): number {
  const scaledSize = fittedSize * zoom;
  if (!positive(scaledSize)) return 0;
  const visible = Math.min(MIN_VISIBLE, viewportSize, scaledSize);
  // A centered picture can move by the sum of the half-sizes, minus the overlap to keep.
  const limit = Math.max(0, viewportSize / 2 + (scaledSize / 2 - visible));
  return clamp(offset, -limit, limit);
}

function pan(state: ViewerState, zoom: number, x: number, y: number): ViewerState {
  const { pictures, index, viewport, fitScale } = state;
  const picture = pictures[index]!;
  if (zoom === FIT.zoom) return { ...state, ...FIT };
  if (!hasSize(picture) || !hasSize(viewport)) return { ...state, zoom, x: 0, y: 0 };
  return {
    ...state,
    zoom,
    x: clampOffset(x, viewport.width, picture.width * fitScale, zoom),
    y: clampOffset(y, viewport.height, picture.height * fitScale, zoom),
  };
}

export function openViewer(card: ViewerCard): ViewerState | ViewerFallback {
  // The card renderer can offer the checked link when available.
  if (card.source.mode !== "show") return { open: false, showLink: true };

  const reply = card.replyPictures?.some(({ id }) => id === card.id) ? card.replyPictures : [card];
  const pictures: ViewablePicture[] = [];
  let index = 0;
  for (const item of reply) {
    const picture = item.id === card.id ? card : item;
    const { id, source, width, height } = picture;
    if (source.mode !== "show") continue;
    if (id === card.id) index = pictures.length;
    pictures.push({ id, width, height, src: source.src, alt: source.alt });
  }
  const viewport = card.viewport && { ...card.viewport };
  return { open: true, openerCardId: card.id, pictures, index, viewport, fitScale: fitScale(pictures[index]!, viewport), ...FIT };
}

export function viewerReduce(state: ViewerState, action: ViewerAction): ViewerState | ViewerClosed {
  switch (action.type) {
    case "zoom-in":
    case "zoom-out": {
      const step = action.type === "zoom-in" ? ZOOM_STEP : -ZOOM_STEP;
      const zoom = clamp(state.zoom + step, FIT.zoom, MAX_ZOOM);
      return zoom === state.zoom ? state : pan(state, zoom, state.x, state.y);
    }
    case "pan":
      if (state.zoom === FIT.zoom || !Number.isFinite(action.dx) || !Number.isFinite(action.dy)) return state;
      return pan(state, state.zoom, state.x + action.dx, state.y + action.dy);
    case "reset":
      return { ...state, ...FIT };
    case "next":
    case "previous": {
      const step = action.type === "next" ? 1 : -1;
      const index = clamp(state.index + step, 0, state.pictures.length - 1);
      if (index === state.index) return state;
      return { ...state, index, fitScale: fitScale(state.pictures[index]!, state.viewport), ...FIT };
    }
    case "close":
      return { closed: true, focusCardId: state.openerCardId };
  }
}

export function viewerKey(key: string): ViewerAction | undefined {
  switch (key) {
    case "+": return { type: "zoom-in" };
    case "-": return { type: "zoom-out" };
    case "ArrowLeft": return { type: "pan", dx: -PAN_STEP, dy: 0 };
    case "ArrowRight": return { type: "pan", dx: PAN_STEP, dy: 0 };
    case "ArrowUp": return { type: "pan", dx: 0, dy: -PAN_STEP };
    case "ArrowDown": return { type: "pan", dx: 0, dy: PAN_STEP };
    case "0": return { type: "reset" };
    case "Escape": return { type: "close" };
  }
}

export function viewerLabel(state: ViewerState | ViewerFallback | ViewerClosed): string {
  if ("closed" in state) return "Picture viewer closed";
  if (!state.open) return "Picture unavailable";
  const position = state.pictures.length === 1 ? "Picture" : `Picture ${state.index + 1} of ${state.pictures.length}`;
  return `${position}, zoom ${Math.round(state.zoom * 100)}%`;
}

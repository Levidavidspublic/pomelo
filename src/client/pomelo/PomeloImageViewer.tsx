import { useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { checkImageSource } from "./image-source.js";
import {
  viewerKey,
  viewerLabel,
  viewerReduce,
  type ViewerAction,
  type ViewerClosed,
  type ViewerFallback,
  type ViewerState,
} from "./image-viewer.js";

type PomeloImageViewerProps = {
  state: ViewerState | ViewerFallback;
  linkHref?: string;
  onChange: (state: ViewerState) => void;
  onClose: (focusCardId: string) => void;
};

function viewerActionForKey(key: string): ViewerAction | undefined {
  const action = viewerKey(key);
  if (action) return action;
  if (key === "PageUp") return { type: "previous" };
  if (key === "PageDown") return { type: "next" };
}

export function viewerStep(state: ViewerState, key: string): ViewerState | ViewerClosed {
  const action = viewerActionForKey(key);
  return action ? viewerReduce(state, action) : state;
}

function positiveSize(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : undefined;
}

export function PomeloImageViewer({ state, linkHref, onChange, onClose }: PomeloImageViewerProps) {
  const picture = state.open ? state.pictures[state.index] : undefined;
  const source = picture && checkImageSource(picture);
  const showImage = source?.mode === "show";
  const dialogRef = useRef<HTMLDialogElement>(null);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!showImage || !dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, [showImage]);

  if (!state.open || !picture || !showImage) {
    const href = linkHref ?? (source?.mode === "link" ? source.href : undefined);
    return href ? (
      <a className="underline" href={href} rel="noopener noreferrer" target="_blank">
        Open picture
      </a>
    ) : null;
  }

  const current = state;
  const singlePicture = current.pictures.length === 1;
  const controls: { label: string; action: ViewerAction; unavailable?: boolean; shortcut?: string }[] = [
    { label: "Zoom in", action: { type: "zoom-in" } },
    { label: "Zoom out", action: { type: "zoom-out" } },
    { label: "Fit to window", action: { type: "reset" }, shortcut: "0" },
    { label: "Previous picture", action: { type: "previous" }, unavailable: current.index === 0, shortcut: "PageUp" },
    { label: "Next picture", action: { type: "next" }, unavailable: current.index === current.pictures.length - 1, shortcut: "PageDown" },
    { label: "Close", action: { type: "close" }, shortcut: "Escape" },
  ];

  function dispatch(action: ViewerAction) {
    const result = viewerReduce(current, action);
    if ("closed" in result) {
      dialogRef.current?.close();
      onClose(result.focusCardId);
    } else if (result !== current) {
      onChange(result);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const action = viewerActionForKey(event.key);
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    dispatch(action);
  }

  const width = positiveSize(picture.width);
  const height = positiveSize(picture.height);
  return (
    <dialog
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Picture viewer"
      className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] overflow-auto rounded-xl border border-border bg-background p-0 text-foreground backdrop:bg-black/75"
      onKeyDown={handleKeyDown}
      onCancel={(event) => {
        event.preventDefault();
        dispatch({ type: "close" });
      }}
    >
      <div
        className="grid h-[70dvh] max-h-[75dvh] w-[min(75rem,calc(100vw-2rem))] max-w-full grid-cols-1 grid-rows-1 place-items-center overflow-hidden bg-muted"
        style={{ width: positiveSize(current.viewport?.width), height: positiveSize(current.viewport?.height) }}
      >
        <img
          className="max-h-full max-w-full object-contain"
          src={source.src}
          alt={source.alt}
          style={{
            width: width && width * current.fitScale,
            height: height && height * current.fitScale,
            transform: `translate(${current.x}px, ${current.y}px) scale(${current.zoom})`,
          }}
        />
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2 border-t border-border p-2">
        {controls.map(({ label, action, unavailable, shortcut }) => (
          <button
            key={label}
            type="button"
            aria-label={label}
            aria-keyshortcuts={shortcut}
            aria-disabled={unavailable || undefined}
            disabled={singlePicture && unavailable}
            className="min-h-9 rounded-md border border-border px-3 text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 aria-disabled:opacity-50"
            onClick={unavailable ? undefined : () => dispatch(action)}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="sr-only" aria-live="polite" aria-atomic="true">{viewerLabel(current)}</p>
    </dialog>
  );
}

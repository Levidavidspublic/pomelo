import { useLayoutEffect, useRef, useState } from "react";
import { blur, pressKey, startEdit, typeText, type TitleEditResult, type TitleEditState } from "./title-edit.js";

export interface PomeloTitleEditProps {
  title: string;
  onSave: (title: string) => void;
  initialEditing?: boolean;
}

type TitleEditEvent =
  | { type: "key"; key: string; isComposing: boolean }
  | { type: "text"; text: string }
  | { type: "blur" };

export function titleEditStep(state: TitleEditState, event: TitleEditEvent): TitleEditResult {
  switch (event.type) {
    case "key": return pressKey(state, event);
    case "text": return typeText(state, event.text);
    case "blur": return blur(state);
  }
}

export function titleEditView(state: TitleEditState) {
  const { text, dir } = state;
  if (state.editing) return { mode: "editing", text, dir, inputLabel: "Thread title" } as const;
  // Match the default in the backend thread title model.
  return { mode: "rest", text: text.trim() ? text : "New thread", dir, buttonLabel: "Rename thread" } as const;
}

function restingTitle(title: string): TitleEditState {
  const { text, dir } = startEdit(title).state;
  return { editing: false, text, dir };
}

export function PomeloTitleEdit({ title, onSave, initialEditing }: PomeloTitleEditProps) {
  const [{ state, focus }, setEditor] = useState<{
    state: TitleEditState;
    focus?: "input" | "button";
  }>(() => ({ state: initialEditing ? startEdit(title).state : restingTitle(title) }));
  const [previousTitle, setPreviousTitle] = useState(title);
  const eventState = useRef(state);
  const renameButton = useRef<HTMLButtonElement>(null);

  if (title !== previousTitle) {
    setPreviousTitle(title);
    if (!state.editing) setEditor({ state: restingTitle(title), focus });
  }

  useLayoutEffect(() => {
    if (focus === "button") renameButton.current?.focus();
  }, [focus]);

  function step(event: TitleEditEvent) {
    // A blur can follow a key before React commits the new state.
    const current = eventState.current;
    const { state: next, effect } = titleEditStep(current, event);
    if (next === current) return false;
    eventState.current = next;
    setEditor({ state: next, focus: effect && event.type === "key" ? "button" : undefined });
    if (effect && "save" in effect) onSave(effect.save);
    return effect !== undefined;
  }

  const view = titleEditView(state);
  if (view.mode === "editing") {
    return (
      <input
        type="text"
        aria-label={view.inputLabel}
        dir={view.dir}
        value={view.text}
        autoFocus={focus === "input"}
        className="min-h-8 w-full min-w-0 rounded-md border border-[var(--border)] bg-background px-2 text-start text-sm focus-visible:ring-2 focus-visible:ring-ring"
        onChange={(event) => step({ type: "text", text: event.currentTarget.value })}
        onKeyDown={(event) => {
          const { isComposing, keyCode } = event.nativeEvent;
          if (step({ type: "key", key: event.key, isComposing: isComposing || keyCode === 229 })) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
        onBlur={() => step({ type: "blur" })}
      />
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <h1 dir={view.dir} className="min-w-0 truncate text-sm font-semibold">{view.text}</h1>
      <button
        ref={renameButton}
        type="button"
        className="min-h-8 shrink-0 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => {
          const next = startEdit(state.text).state;
          eventState.current = next;
          setEditor({ state: next, focus: "input" });
        }}
      >
        {view.buttonLabel}
      </button>
    </div>
  );
}

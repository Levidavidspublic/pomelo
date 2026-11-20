type Direction = "rtl" | "ltr" | "auto";

export type TitleEditState = {
  readonly text: string;
  readonly dir: Direction;
} & (
  | { readonly editing: true; readonly originalTitle: string }
  | { readonly editing: false }
);

export interface TitleEditResult {
  readonly state: TitleEditState;
  readonly effect?: { save: string } | { cancel: true };
}

// Match the backend thread title limit in src/pomelo/thread-title.ts.
const TITLE_LIMIT = 80;
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

// Hebrew and Arabic punctuation with strong bidi classes, plus RLM.
const RTL_MARKS = /[\u05BE\u05C0\u05C3\u05C6\u05F3\u05F4\u0608\u060B\u060D\u061B-\u061F\u066D\u06D4\u06FD\u06FE\u200F]/u;
const RTL_SCRIPT = /[\p{Script=Hebrew}\p{Script=Arabic}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}\p{Script=Samaritan}\p{Script=Mandaic}\p{Script=Adlam}\p{Script=Hanifi_Rohingya}]/u;
const LETTER = /[\p{Letter}\p{Letter_Number}]/u;

function titleDirection(text: string): Direction {
  for (const character of text) {
    if (RTL_MARKS.test(character)) return "rtl";
    if (character === "\u200E") return "ltr";
    if (LETTER.test(character)) return RTL_SCRIPT.test(character) ? "rtl" : "ltr";
  }
  return "auto";
}

function capText(text: string): string {
  if (text.length <= TITLE_LIMIT) return text;
  let count = 0;
  for (const { index } of graphemes.segment(text)) {
    if (count === TITLE_LIMIT) return text.slice(0, index);
    count++;
  }
  return text;
}

export function startEdit(title: string): TitleEditResult {
  return { state: { editing: true, originalTitle: title, text: title, dir: titleDirection(title) } };
}

export function typeText(state: TitleEditState, text: string): TitleEditResult {
  if (!state.editing || text === state.text) return { state };
  const draft = capText(text);
  return { state: { ...state, text: draft, dir: titleDirection(draft) } };
}

function cancel(originalTitle: string): TitleEditResult {
  return {
    state: { editing: false, text: originalTitle, dir: titleDirection(originalTitle) },
    effect: { cancel: true },
  };
}

export function pressKey(
  state: TitleEditState,
  event: { readonly key: string; readonly isComposing: boolean },
): TitleEditResult {
  if (!state.editing || event.isComposing) return { state };
  if (event.key === "Escape") return cancel(state.originalTitle);
  if (event.key === "Enter") return blur(state);
  return { state };
}

export function blur(state: TitleEditState): TitleEditResult {
  if (!state.editing) return { state };
  const title = state.text.trim();
  if (!title || title === state.originalTitle.trim()) return cancel(state.originalTitle);
  return {
    state: { editing: false, text: title, dir: titleDirection(title) },
    effect: { save: title },
  };
}

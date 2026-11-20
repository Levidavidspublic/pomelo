import { useId, useRef } from "react";
import { Button } from "../components/ui/button.js";
import type { CodeBlockModel } from "./code-block.js";

type PomeloCodeBlockProps = {
  model: CodeBlockModel;
  onCopy: (text: string) => void;
  onShowAll: () => void;
};

export function PomeloCodeBlock({ model, onCopy, onShowAll }: PomeloCodeBlockProps) {
  const codeId = useId();
  const languageId = `${codeId}-language`;
  const codePane = useRef<HTMLPreElement>(null);
  const { copy, dir, languageLabel, showAllLabel, visibleText } = model;

  return (
    <figure
      dir={dir}
      aria-labelledby={languageId}
      className="mx-0 my-2 min-w-0 max-w-full rounded-lg border border-border bg-[var(--code-bg)] text-left"
    >
      <figcaption className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-1">
        <span id={languageId} className="font-mono text-xs text-muted-foreground">{languageLabel}</span>
        <Button type="button" variant="ghost" size="sm" disabled={!copy.enabled} onClick={() => onCopy(copy.text)}>
          {copy.label}
        </Button>
      </figcaption>
      <span className="sr-only" role="status">{copy.label === "copy" ? "" : copy.label}</span>
      <pre
        id={codeId}
        ref={codePane}
        tabIndex={0}
        role="group"
        aria-label={languageLabel === "code" ? "Code" : `${languageLabel} code`}
        className="m-0 max-w-full overflow-x-auto whitespace-pre px-3 py-2 font-mono text-xs leading-relaxed focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      >
        <code>{visibleText}</code>
      </pre>
      {showAllLabel !== null && (
        <div className="border-t border-border px-3 py-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-controls={codeId}
            aria-expanded={false}
            onClick={() => {
              // Keep keyboard focus in the block when the show-all button disappears.
              codePane.current?.focus();
              onShowAll();
            }}
          >
            {showAllLabel}
          </Button>
        </div>
      )}
    </figure>
  );
}

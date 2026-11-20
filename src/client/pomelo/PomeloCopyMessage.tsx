import { useRef, useState } from "react";
import { copyTextFor, type CopyPart } from "./message-copy.js";

const COPY_LABELS = { reset: "Copy", success: "Copied", failure: "Could not copy" } as const;
type CopyStatus = keyof typeof COPY_LABELS;

export function copyStatusLabel(state: CopyStatus) {
  return COPY_LABELS[state];
}

type PomeloCopyMessageProps = {
  reply: readonly CopyPart[];
  writeText: (text: string) => Promise<void>;
  dir?: "ltr" | "rtl" | "auto";
};

export function PomeloCopyMessage({ reply, writeText, dir }: PomeloCopyMessageProps) {
  const [status, setStatus] = useState<CopyStatus>("reset");
  const writing = useRef(false);
  const label = copyStatusLabel(status);

  async function copy() {
    if (writing.current) return;

    const { text } = copyTextFor(reply, "plain");
    if (text === "") {
      setStatus("failure");
      return;
    }

    writing.current = true;
    setStatus("reset");
    try {
      await writeText(text);
      setStatus("success");
    } catch {
      setStatus("failure");
    } finally {
      writing.current = false;
    }
  }

  return (
    <div dir={dir} lang="en">
      <button
        type="button"
        className="cursor-pointer rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
        onClick={copy}
      >
        {label}
      </button>
      <span className="sr-only" role="status" aria-live="polite">{status === "reset" ? "" : label}</span>
    </div>
  );
}

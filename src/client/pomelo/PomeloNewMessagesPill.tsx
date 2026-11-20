import { chatFollowView, type ChatFollowState } from "./chat-follow.js";

export interface PomeloNewMessagesPillProps {
  state: ChatFollowState;
  onJump?: () => void;
  dir?: "rtl" | "ltr";
}

export function PomeloNewMessagesPill({ state, onJump, dir = "ltr" }: PomeloNewMessagesPillProps) {
  const { showPill, pillLabel } = chatFollowView(state);
  if (!showPill) return null;

  return (
    <div role="status" aria-live="polite" dir={dir}>
      <button
        type="button"
        dir="auto"
        className="min-h-8 cursor-pointer rounded-full border border-[var(--border)] bg-background px-3 text-sm text-foreground hover:bg-[var(--hover)] focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => onJump?.()}
      >
        {pillLabel}
      </button>
    </div>
  );
}

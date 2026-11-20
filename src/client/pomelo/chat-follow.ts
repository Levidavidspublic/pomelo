export const CHAT_FOLLOW_THRESHOLD_PX = 48;

export type ChatFollowState = {
  following: boolean;
  unseen: number;
};

export type ChatFollowEvent =
  | { type: "scrolled"; scrollTop: number; scrollHeight: number; clientHeight: number }
  | { type: "arrived"; mine: boolean }
  | { type: "streamed" }
  | { type: "jumpToLatest" }
  | { type: "threadChanged" };

export type ChatFollowView = {
  scrollToBottom: boolean;
  showPill: boolean;
  pillLabel: string;
};

export function initialChatFollow(): ChatFollowState {
  return { following: true, unseen: 0 };
}

export function chatFollowReduce(state: Readonly<ChatFollowState>, event: ChatFollowEvent): ChatFollowState {
  switch (event.type) {
    case "scrolled": {
      const { scrollTop, scrollHeight, clientHeight } = event;
      if (![scrollTop, scrollHeight, clientHeight].every((px) => Number.isFinite(px) && px >= 0)) {
        return { ...state };
      }

      const gap = scrollHeight - clientHeight - scrollTop;
      if (gap <= CHAT_FOLLOW_THRESHOLD_PX) return initialChatFollow();
      return { following: false, unseen: state.unseen };
    }
    case "arrived":
      if (event.mine) return initialChatFollow();
      if (state.following) return { ...state };
      return { following: false, unseen: state.unseen + 1 };
    case "streamed":
      return { ...state };
    case "jumpToLatest":
    case "threadChanged":
      return initialChatFollow();
  }
}

export function chatFollowView({ following, unseen }: Readonly<ChatFollowState>): ChatFollowView {
  const showPill = !following && unseen > 0;
  let pillLabel = "";
  if (showPill) {
    if (unseen === 1) pillLabel = "1 new message";
    else if (unseen > 99) pillLabel = "99+ new messages";
    else pillLabel = `${unseen} new messages`;
  }
  return { scrollToBottom: following, showPill, pillLabel };
}

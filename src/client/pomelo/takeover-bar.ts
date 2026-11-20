import type { TakeoverState } from "../../pomelo/browser/takeover-rule.js";

const ENGLISH = Object.freeze({
  dir: "ltr",
  agentDriving: "The agent is driving",
  userDriving: "You are driving",
  takeOver: "Take over",
  handBack: "Hand back",
  jobEnded: "This job has ended",
  controlUnknown: "Browser control is not known",
  reread: "The agent will read the page again before it carries on",
  newApproval: "A fill or import will need a new approval",
});

const HEBREW = Object.freeze({
  dir: "rtl",
  agentDriving: "השליטה בדפדפן אצל הסוכן",
  userDriving: "השליטה בדפדפן אצלך",
  takeOver: "לקחת שליטה",
  handBack: "להחזיר שליטה",
  jobEnded: "המשימה הסתיימה",
  controlUnknown: "לא ידוע מי שולט בדפדפן",
  reread: "הסוכן יקרא שוב את הדף לפני שימשיך",
  newApproval: "למילוי או לייבוא יידרש אישור חדש",
});

interface TakeoverBarModel {
  line: string;
  action: "take_over" | "hand_back" | null;
  actionLabel: string | null;
  note: string | null;
  dir: "ltr" | "rtl";
}

function isTakeoverState(state: unknown): state is TakeoverState {
  if (typeof state !== "object" || state === null || Array.isArray(state)) return false;

  const { driver, takenAt, handedBackAt, pageChangedSinceTakeOver } = state as Partial<TakeoverState>;
  return (driver === "agent" || driver === "amit")
    && typeof pageChangedSinceTakeOver === "boolean"
    && (takenAt === undefined || Number.isFinite(takenAt))
    && (handedBackAt === undefined || (driver === "agent" && Number.isFinite(handedBackAt)
      && (takenAt === undefined || handedBackAt >= takenAt)));
}

export function takeoverBar({ state, jobState, lang = "en" }: {
  state?: unknown;
  jobState: string;
  lang?: string;
}): TakeoverBarModel {
  const wording = lang.toLowerCase().split("-")[0] === "he" ? HEBREW : ENGLISH;
  const { dir } = wording;
  if (jobState === "done" || jobState === "failed" || jobState === "cancelled") {
    return { line: wording.jobEnded, action: null, actionLabel: null, note: null, dir };
  }
  if (!isTakeoverState(state)) {
    return { line: wording.controlUnknown, action: null, actionLabel: null, note: null, dir };
  }

  let note: string | null = state.pageChangedSinceTakeOver ? wording.reread : null;
  if (state.handedBackAt !== undefined) {
    note = note === null ? wording.newApproval : `${note}. ${wording.newApproval}`;
  }

  if (state.driver === "amit") {
    return { line: wording.userDriving, action: "hand_back", actionLabel: wording.handBack, note, dir };
  }
  return { line: wording.agentDriving, action: "take_over", actionLabel: wording.takeOver, note, dir };
}

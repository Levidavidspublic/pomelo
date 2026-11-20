import { HIDDEN } from "../../secrets.js";
import { MASK } from "../mask.js";

type ElementId = string | number;
type PageLabel = string | { readonly label: string };

interface ChatButton {
  readonly id?: ElementId;
  readonly label: string;
  readonly disabled?: boolean;
}

interface ChatInput {
  readonly id?: ElementId;
  readonly label?: string;
  readonly placeholder?: string;
  readonly type?: string;
  readonly value?: unknown;
}

interface ChatSurface {
  readonly title?: string;
  readonly text?: string;
  readonly buttons?: readonly ChatButton[];
  readonly inputs?: readonly ChatInput[];
  readonly fields?: readonly ChatInput[];
}

interface ChatDialog extends ChatSurface {
  /** False when the read shows a launcher that does not cover the page. */
  readonly blocksPage?: boolean;
}

export interface LiveChatPageRead extends ChatSurface {
  readonly dialogs?: readonly ChatDialog[];
  readonly links?: readonly PageLabel[];
  /** Friday's flat numbered read, when the browser does not supply structured controls. */
  readonly items?: readonly string[];
}

export type LiveChatKind = "chat-open" | "chat-invite" | "call-request";

interface DecisionDetails {
  readonly reason: string;
  readonly mayNot: readonly string[];
}

export type LiveChatDecision = DecisionDetails & (
  | { action: "go-on"; kind?: never; closeTarget?: never }
  | { action: "hold"; kind?: LiveChatKind; closeTarget?: never }
  | { action: "close"; kind: "chat-invite"; closeTarget: ElementId }
);

const MAY_NOT = Object.freeze([
  "type a message", "press start chat", "press send", "press request a call", "give a phone number or email",
]);
const CLOSE_LABELS = new Set(["close", "×", "no thanks", "no, thanks", "סגור", "לא תודה"]);
const CHAT = /\b(?:(?:live (?:support )?|support )chat|chat (?:with (?:us|(?:an?|our) (?:(?:live|support) )?(?:agent|representative|team)|support)|support))\b|(?:צ'?אט (?:חי|עם (?:נציג|סוכן|תמיכה)|שירות)|(?:שוחח(?:ו|י)?|דבר(?:ו|י)?) עם נציג)/u;
const ACTIVE_CHAT = /\byou are (?:now )?chatting with\b|(?:אתם|אתן|אתה|את) (?:משוחח(?:ים|ות|ת)?|בצ'?אט) (?:כעת |עכשיו )?עם/u;
const INVITE = /\b(?:(?:start|open|begin) (?:a |the )?(?:live )?chat(?:ting)?|(?:would you like to|want to|let's) chat)\b|(?:(?:התחל(?:ו|י)?|פתח(?:ו|י)?|להתחיל) (?:ב)?צ'?אט|פתיחת צ'?אט|(?:רוצה|רוצים) (?:לשוחח|לצ'?וטט))/u;
const CALLBACK = /\b(?:request (?:a |your )?(?:call(?:[ -]?back)?|phone call)|(?:we will|we'll) call you)\b|(?:בקשת |בקשה ל|בקש(?:ו|י)? )שיחה חוזרת|(?:נחזור אלי(?:ך|כם|כן)|נ(?:תקשר|צלצל) אלי(?:ך|כם|כן))/u;
const WRITE_MESSAGE = /^(?:(?:please )?(?:type|write|enter) (?:your |a )?message(?: here)?|(?:הקלד|הקלידו|הקלידי|כתוב|כתבו|כתבי|הזן|הזינו|הזיני) (?:כאן )?(?:את )?(?:ה)?(?:הודעתך|הודעה(?: (?:שלך|שלכם|שלכן))?))$/u;
const MESSAGE_LABEL = /^(?:(?:your )?message|chat message|הודעה|ההודעה שלך)$/u;
const SEND = /^(?:send(?: message)?|שלח(?:ו|י)?(?: הודעה)?|שליחה)$/u;
// The quoted label ends before any input value or link destination.
const NUMBERED_CONTROL = /^\[(\d+)\]\s+(\S+)\s+("(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[\da-fA-F]{4}))*")(?=$| [=→] )/;

function normalize(text = ""): string {
  // Keep masks in place so wording on opposite sides of a mask cannot form a match.
  return text.normalize("NFKD").replace(/[\p{M}\p{Cf}]/gu, "").toLowerCase()
    .replace(/[’׳]/gu, "'").replace(/\s+/g, " ").trim();
}

function prompt(text?: string): string {
  return normalize(text).replace(/[.!?:…]+$/, "").trimEnd();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function optionalText(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function optionalList(value: unknown, valid: (item: unknown) => boolean): boolean {
  return value === undefined || (Array.isArray(value) && [...value].every(valid));
}

function optionalId(value: unknown): boolean {
  return value === undefined || typeof value === "string" || typeof value === "number";
}

function isInput(value: unknown): boolean {
  return isRecord(value) && optionalId(value.id) && optionalText(value.label)
    && optionalText(value.placeholder) && optionalText(value.type);
}

function isSurface(value: unknown): value is Record<string, unknown> & ChatSurface {
  return isRecord(value) && optionalText(value.title) && optionalText(value.text)
    && optionalList(value.buttons, (button) => isRecord(button) && optionalId(button.id)
      && typeof button.label === "string" && (button.disabled === undefined || typeof button.disabled === "boolean"))
    && optionalList(value.inputs, isInput) && optionalList(value.fields, isInput);
}

function isPageRead(value: unknown): value is LiveChatPageRead {
  return isSurface(value)
    && optionalList(value.dialogs, (dialog) => isSurface(dialog)
      && (dialog.blocksPage === undefined || typeof dialog.blocksPage === "boolean"))
    && optionalList(value.links, (link) => typeof link === "string" || (isRecord(link) && typeof link.label === "string"))
    && optionalList(value.items, (item) => typeof item === "string");
}

function numberedControls(items: readonly string[]) {
  return items.flatMap((item) => {
    const match = NUMBERED_CONTROL.exec(item);
    if (!match) return [];
    const [, id, role, label] = match;
    return [{ id: Number(id), role, label: JSON.parse(label) as string }];
  });
}

function isReadable(fact?: string): boolean {
  return Boolean(normalize(fact).replaceAll(MASK, "").replaceAll(HIDDEN, "").trim());
}

function classify(surface: ChatSurface, linkLabels?: ReadonlySet<string>) {
  const buttons = (surface.buttons ?? []).map(({ label }) => prompt(label));
  const inputs = [...(surface.inputs ?? []), ...(surface.fields ?? [])];
  const lines = (surface.text ?? "").split(/\r?\n/).map(prompt).filter((line) => !linkLabels?.has(line));
  const copy = [prompt(surface.title), ...lines];
  const wording = [...copy, ...buttons];
  const chat = wording.some((line) => CHAT.test(line));
  const active = wording.some((line) => ACTIVE_CHAT.test(line));
  const send = buttons.some((label) => SEND.test(label));
  const messageBox = inputs.some(({ type, label, placeholder }) => {
    const inputType = normalize(type);
    if (inputType && !["text", "textarea", "textbox"].includes(inputType)) return false;
    const labels = [prompt(label), prompt(placeholder)];
    if (labels.some((name) => WRITE_MESSAGE.test(name))) return chat || send;
    return chat && (labels.some((name) => MESSAGE_LABEL.test(name))
      || (inputType === "textarea" && send) || ((inputType === "textarea" || send) && !labels.some(Boolean)));
  });
  const invitation = (line: string) => CHAT.test(line) || INVITE.test(line);
  return {
    call: wording.some((line) => CALLBACK.test(line)),
    open: active || messageBox,
    invite: wording.some(invitation),
    inviteCopy: copy.some(invitation),
    readable: [...wording, ...inputs.flatMap(({ label, placeholder }) => [label, placeholder])].some(isReadable),
  };
}

function clearClose(surface: ChatSurface, numbered: ReturnType<typeof numberedControls>): ElementId | undefined {
  const { buttons = [], inputs = [], fields = [] } = surface;
  const [choice, otherChoice] = buttons.filter(({ label, disabled }) =>
    disabled !== true && CLOSE_LABELS.has(normalize(label)));
  if (!choice || otherChoice) return;
  const { id } = choice;
  if (typeof id === "number") {
    if (!Number.isSafeInteger(id) || id <= 0) return;
    const matches = numbered.filter((control) => control.id === id);
    if (numbered.length && (matches.length !== 1 || matches[0].role !== "button"
      || normalize(matches[0].label) !== normalize(choice.label))) return;
  } else if (!id?.trim() || id.includes(MASK) || id.includes(HIDDEN)) return;
  if ([...buttons, ...inputs, ...fields].filter((control) => control.id === id).length === 1) return id;
}

/** Decide from a masked read. The browser job owns any click or handoff to Amit. */
export function liveChatStop(pageRead?: unknown): LiveChatDecision {
  const mayNot = MAY_NOT;
  const unreadable: LiveChatDecision = { action: "hold", reason: "A readable masked page read is required.", mayNot };
  if (!isPageRead(pageRead)) return unreadable;

  const numbered = numberedControls(pageRead.items ?? []);
  const links = new Set([
    ...numbered.filter(({ role }) => role === "link").map(({ label }) => prompt(label)),
    ...(pageRead.links ?? []).map((link) => prompt(typeof link === "string" ? link : link.label)),
  ]);
  const page: ChatSurface = {
    title: pageRead.title,
    text: pageRead.text,
    fields: pageRead.fields,
    buttons: pageRead.buttons ?? numbered.filter(({ role }) => role === "button" || role === "field:submit"),
    inputs: pageRead.inputs ?? numbered.flatMap(({ id, role, label }) => {
      if (role === "field:submit" || !role.startsWith("field:")) return [];
      return [{ id, label, type: role.slice("field:".length) }];
    }),
  };
  const pageFacts = classify(page, links);
  const dialogs = (pageRead.dialogs ?? []).map((dialog) => ({ dialog, ...classify(dialog) }));
  const facts = [pageFacts, ...dialogs];
  if (facts.some(({ call }) => call)) {
    return { action: "hold", kind: "call-request", reason: "Wait for Amit to handle the call request (call-request).", mayNot };
  }
  if (facts.some(({ open }) => open)) {
    return { action: "hold", kind: "chat-open", reason: "Wait for Amit to handle the open chat (chat-open).", mayNot };
  }

  const [invitation, otherInvitation] = dialogs.filter(({ invite }) => invite);
  if (invitation || pageFacts.invite) {
    // A flat launcher button does not identify an open bubble. Prefer the dialog's own controls.
    const surface = invitation?.dialog ?? (dialogs.length === 0 && pageFacts.inviteCopy ? page : undefined);
    const closeTarget = surface && !otherInvitation && invitation?.dialog.blocksPage !== false
      ? clearClose(surface, numbered) : undefined;
    if (closeTarget !== undefined) {
      return { action: "close", kind: "chat-invite", closeTarget, reason: "Close the chat invitation (chat-invite).", mayNot };
    }
    return { action: "hold", kind: "chat-invite", reason: "Wait for Amit to handle the chat invitation (chat-invite).", mayNot };
  }
  if (!facts.some(({ readable }) => readable) && ![...links, ...numbered.map(({ label }) => label)].some(isReadable)) return unreadable;
  return { action: "go-on", reason: "No chat or call request was found.", mayNot };
}

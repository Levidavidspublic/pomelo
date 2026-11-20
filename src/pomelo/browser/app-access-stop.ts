interface AccessCheckbox {
  readonly label: string;
  readonly checked: boolean;
}

interface AccessButton {
  readonly label: string;
  readonly nearbyText?: string;
}

export interface AppAccessPageRead {
  readonly title?: string;
  readonly text?: string;
  readonly checkboxes?: readonly AccessCheckbox[];
  readonly buttons?: readonly AccessButton[];
  /** Friday's numbered controls supply labels, but no reliable checkbox state. */
  readonly items?: readonly string[];
}

export interface AppAccessDecision {
  action: "go" | "hold";
  reason: string;
  signals: ("access-wording" | "permission-list" | "allow-button" | "extra-permissions")[];
}

const ACCOUNT_REQUEST = [
  /\b(?:wants?|would like|asks?|is (?:asking|requesting)) (?:to access |(?:for )?access to )your (?:[^.!?:]{1,50} )?accounts?\b/,
  /(?:מבקש(?:ת|ים|ות)?|מעוניי(?:ן|נת)) (?:(?:לקבל )?גישה (?:ל|אל )|לגשת ל)(?:ה?חשבון|חשבון ה)/u,
  /^(?:אישור גישה|אישור (?:ה)?אפליקציה|אישור (?:ה)?יישום)(?:$| )/u,
];
const PERMISSION_REQUEST = [
  /\b(?:requesting|asking for|requests?) (?:your )?permissions? to ([^.!?]+)/g,
  /\bthis will allow (?!you\b|us\b|them\b)[^.!?:]{1,80}? to ([^.!?]+)/g,
  /(?:מבקש(?:ת|ים|ות)?|מנסה לקבל) (?:את )?(?:ה?הרשאה|רשות) (ל[^.!?]+)/gu,
  /תאפשר ל(?!ך |נו |הם |הן )[^.!?:]{1,80}? (ל[^.!?]+)/gu,
];
const NON_ACCOUNT_SCOPE = [
  /^(?:(?:send|show|display|receive|enable|allow) (?:you )?(?:push )?notifications|(?:set|use|store|place|accept) (?:optional |necessary )?cookies)\b/,
  /^(?:(?:access|use) (?:your |the )?(?:camera|microphone|(?:current )?location|clipboard)|(?:continue|accept (?:our |the )?terms))\b/,
  /^(?:ל(?:שלוח|הציג|קבל|אפשר) (?:לך )?התראות|להשתמש (?:בעוגיות|ב(?:מצלמה|מיקרופון|מיקום|לוח))|לגשת ל(?:מצלמה|מיקרופון|מיקום)|להמשיך|לאשר את התנאים)(?:$|[\s.!?])/u,
];
const NON_ACCOUNT_PROMPT = [
  /^(?:(?:allow|enable) (?:push )?notifications|(?:this|the) (?:site|website) is requesting permission to (?:send|show|display) (?:push )?notifications)\b/,
  /^(?:(?:we use|this (?:site|website) uses|allow|accept) (?:all |optional |necessary )?cookies|cookie (?:consent|preferences|settings))\b/,
  /^(?:(?:new|updated|revised) terms|terms (?:of (?:service|use)|(?:and|&) conditions))$/,
  /^(?:please |by continuing,? you )?(?:accept|agree to) (?:our |the |these )?terms\b/,
  /^(?:(?:אפשר|לאפשר|הפעלת) התראות|(?:האתר|אתר זה) מבקש(?: את)? ה?הרשאה ל(?:שלוח|הציג) התראות)(?:$|[\s.!?])/u,
  /^(?:(?:אנו משתמשים|האתר משתמש) בעוגיות|(?:אפשר|לאפשר|הגדרות|העדפות) עוגיות)(?:$|[\s.!?])/u,
  /^(?:תנאי (?:השימוש|השירות)|תנאים והגבלות)(?: מעודכנים)?$|^(?:יש )?(?:לאשר את התנאים|להסכים לתנאי (?:השימוש|השירות))(?:$|[\s.!?])/u,
];
const AUTHORIZE_APP = /^(?:please )?authori[sz]e (?!(?:(?:this|the|your) )?(?:access|cookies|notifications|payments?|devices?|sign[ -]in|terms)\b)["'“‘]?[\p{L}\p{N}•][^.!?:]{0,79}$/u;
const ALLOW_BUTTON = [
  /^(?:allow|authori[sz]e|grant)(?: (?:access|permissions?))?$/,
  /^continue(?: to (?:the |this )?app)?$/,
  /^(?:אפשר(?: גישה)?|אשר(?: גישה)?|אישור(?: גישה)?|הענק(?: גישה)?|המשך|המשיכו)$/u,
];
const ACCOUNT_PERMISSION = [
  /\b(?:read|view|see|access|manage|edit|send|delete) (?:all (?:of )?)?your (?:e-?mails?|(?:e-?mail )?messages|mail|contacts|calendar|files|profile(?: information)?)\b/,
  /\b(?:act|send (?:e-?mail|messages)) on your behalf\b/,
  /(?:ל)?(?:קרוא|ראות|צפות|גשת|נהל|ערוך|שלוח|מחוק) (?:ב|ל)?(?:את )?(?:הדואר האלקטרוני|המייל(?:ים)?|ההודעות|אנשי הקשר|היומן|הקבצים|הפרופיל) שלך/u,
  /לפעול בשמך/u,
];
const OPTIONAL_PERMISSION = /\b(?:optional|extra|additional) permissions?\b|הרשאות (?:נוספות|אופציונליות)/u;
const NUMBERED_CONTROL = /^\[\d+\]\s+(\S+)\s+("(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[\da-fA-F]{4}))*")(?=$| [→=] )/;
const BUTTON_KIND = /^(?:button|field:(?:button|submit))$/;
const CHECKBOX_KIND = /^(?:field:)?checkbox$/;

function normalize(text: string): string {
  return text.normalize("NFKD").replace(/[\p{M}\p{Cf}]/gu, "").toLowerCase()
    .replace(/\s+/g, " ").trim().replace(/[.!?:…]+$/, "").trimEnd();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isOptionalText(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isList(value: unknown, valid: (item: unknown) => boolean): boolean {
  return value === undefined || (Array.isArray(value) && [...value].every(valid));
}

function isPageRead(value: unknown): value is AppAccessPageRead {
  return isRecord(value) && isOptionalText(value.title) && isOptionalText(value.text)
    && isList(value.checkboxes, (item) =>
      isRecord(item) && typeof item.label === "string" && typeof item.checked === "boolean")
    && isList(value.buttons, (item) =>
      isRecord(item) && typeof item.label === "string" && isOptionalText(item.nearbyText))
    && isList(value.items, (item) => typeof item === "string");
}

function numberedControls(items: readonly string[]): { kind: string; label: string }[] {
  return items.flatMap((item) => {
    const match = NUMBERED_CONTROL.exec(item);
    if (!match) return [];
    // Friday puts any field value or destination after the JSON label.
    return [{ kind: match[1], label: normalize(JSON.parse(match[2]) as string) }];
  });
}

function hasAccessWording(text: string): boolean {
  if (ACCOUNT_REQUEST.some((pattern) => pattern.test(text)) || AUTHORIZE_APP.test(text)) return true;

  return PERMISSION_REQUEST.some((pattern) => [...text.matchAll(pattern)].some(([, scope]) =>
    hasAccountPermission(scope) || !NON_ACCOUNT_SCOPE.some((excluded) => excluded.test(scope))));
}

function hasAccountPermission(text: string): boolean {
  return ACCOUNT_PERMISSION.some((pattern) => pattern.test(text));
}

/** Classify masked page facts for the browser job's handoff to Amit. */
export function appAccessStop(read?: unknown): AppAccessDecision {
  const unreadable: AppAccessDecision = { action: "hold", reason: "A readable masked page read is required.", signals: [] };
  if (!isPageRead(read)) return unreadable;

  const { title = "", text = "", buttons = [], checkboxes = [], items = [] } = read;
  const numbered = numberedControls(items);
  const buttonLabels = new Set(buttons.map(({ label }) => normalize(label)));
  const allButtons: readonly AccessButton[] = [
    ...buttons,
    ...numbered.filter(({ kind, label }) => BUTTON_KIND.test(kind) && !buttonLabels.has(label)),
  ];
  const pageWording = [title, text].map(normalize);
  const checkboxLabels = [
    ...checkboxes.map(({ label }) => normalize(label)),
    ...numbered.filter(({ kind }) => CHECKBOX_KIND.test(kind)).map(({ label }) => label),
  ];
  const buttonWording = allButtons.flatMap(({ label, nearbyText = "" }) => [
    normalize(label), normalize(nearbyText), ...nearbyText.split(/\r?\n/).map(normalize),
  ]);
  const wording = [...pageWording, ...checkboxLabels, ...buttonWording];
  if (![...wording, ...numbered.map(({ label }) => label)].some(Boolean)) return unreadable;

  const accessWording = [...wording, ...text.split(/\r?\n/).map(normalize)].some(hasAccessWording);
  const approvalButtons = allButtons.filter(({ label }) => {
    const normalized = normalize(label);
    return AUTHORIZE_APP.test(normalized) || ALLOW_BUTTON.some((pattern) => pattern.test(normalized));
  });
  const pageHasPermissions = [...pageWording, ...checkboxLabels].some(hasAccountPermission);
  // Fall back to page permissions unless the button belongs to a distinct prompt.
  const permissionsWithApproval = approvalButtons.some(({ label, nearbyText = "" }) => {
    const context = normalize(nearbyText);
    return hasAccountPermission(normalize(label)) || hasAccountPermission(context)
      || (pageHasPermissions && !NON_ACCOUNT_PROMPT.some((pattern) => pattern.test(context)));
  });

  if (!accessWording && !permissionsWithApproval) {
    return { action: "go", reason: "No app access request was found.", signals: [] };
  }

  const signals: AppAccessDecision["signals"] = [];
  if (accessWording) signals.push("access-wording");
  if (permissionsWithApproval || wording.some(hasAccountPermission)) signals.push("permission-list");
  if (approvalButtons.length) signals.push("allow-button");
  if (checkboxes.some(({ label, checked }) => {
    const normalized = normalize(label);
    return checked && (hasAccountPermission(normalized) || OPTIONAL_PERMISSION.test(normalized));
  })) signals.push("extra-permissions");
  return { action: "hold", reason: "This page asks for account access that Amit needs to review.", signals };
}

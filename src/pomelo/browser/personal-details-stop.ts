const DETAIL_KINDS = ["id-number", "date-of-birth", "phone", "address", "age-check"] as const;

export type PersonalDetailKind = typeof DETAIL_KINDS[number];

export interface PersonalDetailsField {
  readonly label?: string;
  readonly type?: string;
  readonly autocomplete?: string;
  readonly required?: boolean;
  readonly value?: string | null;
}

export interface PersonalDetailsPageRead {
  readonly title?: string;
  readonly text?: string;
  readonly fields?: readonly PersonalDetailsField[];
  readonly buttons?: readonly (string | { readonly label: string })[];
  readonly items?: readonly string[];
}

export interface PersonalDetailsDecision {
  action: "go" | "hold";
  reason: string;
  kinds: PersonalDetailKind[];
}

const AGE_CONFIRMATION = /\b(?:are you|i am|i['’]m|confirm (?:that )?you are|you must be) (?:(?:at least|over|older than|under|aged?) \d{2}\b|\d{2}(?:\+| years? (?:old|of age)\b| or (?:older|over)\b|[.!?]?$|\?))|(?:אני|האם את(?:ה|ם|ן)?) (?:מעל גיל|בגיל) \d{2}\b/u;
const BIRTH_YEAR_PROMPT = /\b(?:enter|select|choose) (?:your |the )?(?:birth year|year of birth)\b/;
const AGE_LABEL = /^(?:age (?:check|gate|verification)|verify your age|confirm your age|אימות גיל|בדיקת גיל)[.!?:]*$/u;
const ID_LABEL = /\b(?:national[ -]+(?:id|identification)(?:[ -]+(?:no\.?|number))?|(?:id|identification)[ -]+(?:no\.?|number)|passport(?:[ -]+(?:no\.?|number))?)\b|תעודת זהות|(?:^|[^\p{L}\p{N}])ת\s*[.״׳"']\s*ז(?:$|[^\p{L}\p{N}])/u;
const BIRTH_LABEL = /\b(?:date[ -]+of[ -]+birth|birth[ -]*(?:date|day|month|year)|year[ -]+of[ -]+birth|d\.?o\.?b)\b|תאריך לידה|שנת לידה/u;
const PHONE_LABEL = /\b(?:phone|telephone|cellphone|mobile number)\b|טלפון/u;
const ADDRESS_LABEL = /\b(?:(?:street|home|residential|postal|mailing|shipping|billing) address|address(?: line)? [12]|street (?:name|number)|post[ -]*code|postal[ -]*code|zip(?:[ -]*code)?)\b|^(?:address|street)[\s:*]*$|כתובת מגורים|מיקוד/u;
const SEARCH_LABEL = /^(?:search\b|חיפוש)/u;
const EMAIL_LABEL = /^(?:e-?mail(?: address)?|username|user name|שם משתמש|אימייל|דואר אלקטרוני)[\s:*]*$/u;
const PASSWORD_LABEL = /^(?:password|סיסמ[הא])[\s:*]*$/u;
const SECRET_LABEL = /\b(?:card[ -]+(?:number|expiry|expiration|security code)|one[ -]+time[ -]+(?:code|password|passcode)|verification code|otp|cvv|cvc)\b|קוד אימות/u;
const OPTIONAL_LABEL = /\boptional\b|אופציונלי/u;
const AGE_CONTROL_TYPE = /^(?:button|submit|reset|checkbox|radio)$/;
const NON_ENTRY_TYPE = /^(?:image|hidden|file|color|range)$/;
// The quoted JSON label ends before a value or a link destination.
const NUMBERED_ITEM = /^\[\d+\]\s+(\S+)\s+("(?:[^"\\]|\\.)*")(?=$| = | → )/i;

function normalize(text = ""): string {
  return text.normalize("NFKD").replace(/[\p{M}\p{Cf}]/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function fieldType(type: string | undefined): string {
  const normalized = normalize(type);
  if (normalized === "select-one" || normalized === "select-multiple") return "select";
  return normalized === "textarea" ? "text" : normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isList(value: unknown, valid: (item: unknown) => boolean): boolean {
  return value === undefined || (Array.isArray(value) && [...value].every(valid));
}

function isPageRead(value: unknown): value is PersonalDetailsPageRead {
  return isRecord(value)
    && (value.title === undefined || isString(value.title))
    && (value.text === undefined || isString(value.text))
    && isList(value.fields, (field) => isRecord(field)
      && [field.label, field.type, field.autocomplete].every((fact) => fact === undefined || isString(fact))
      && (field.required === undefined || typeof field.required === "boolean"))
    && isList(value.buttons, (button) => isString(button) || (isRecord(button) && isString(button.label)))
    && isList(value.items, isString);
}

type FieldKind = Exclude<PersonalDetailKind, "age-check"> | "search" | "email" | "password" | "typed-secret";

function fieldKind(label: string, type: string, hint: string | undefined): FieldKind | undefined {
  if (type === "search" || SEARCH_LABEL.test(label)) return "search";
  if (hint === "one-time-code" || hint?.startsWith("cc-") || SECRET_LABEL.test(label)) return "typed-secret";
  if (ID_LABEL.test(label)) return "id-number";
  if (/^bday(?:-day|-month|-year)?$/.test(hint ?? "") || BIRTH_LABEL.test(label)) return "date-of-birth";
  if (/^(?:street-address|address-line[1-3]|postal-code)$/.test(hint ?? "") || ADDRESS_LABEL.test(label)) return "address";
  if (/^tel(?:-[a-z]+)*$/.test(hint ?? "") || PHONE_LABEL.test(label)) return "phone";
  if (type === "password" || /^(?:current|new)-password$/.test(hint ?? "") || PASSWORD_LABEL.test(label)) return "password";
  if (type === "email" || hint === "username" || hint === "email" || EMAIL_LABEL.test(label)) return "email";
  if (type === "tel") return "phone";
}

function agePrompt(label: string): boolean {
  return AGE_CONFIRMATION.test(label) || AGE_LABEL.test(label) || BIRTH_YEAR_PROMPT.test(label);
}

function requestedKind(label: string, kind: FieldKind | undefined): PersonalDetailKind | undefined {
  if (kind === "search" || kind === "typed-secret") return;
  if (agePrompt(label)) return "age-check";
  if (kind !== "email" && kind !== "password") return kind;
}

/** Classify a single masked page read for the browser lane's human handoff. */
export function personalDetailsStop(pageRead?: unknown): PersonalDetailsDecision {
  const unreadable: PersonalDetailsDecision = { action: "hold", reason: "A readable masked page read is required.", kinds: [] };
  try {
    if (!isPageRead(pageRead)) return unreadable;
    const { title, text, fields = [], buttons = [], items = [] } = pageRead;
    const prompts = [normalize(title), normalize(text), ...buttons.map((button) =>
      normalize(isString(button) ? button : button.label))];
    const kinds = new Set<PersonalDetailKind>();
    const fieldKinds: (FieldKind | undefined)[] = [];
    const unmatchedFields = fields.map((field) => ({ label: normalize(field.label), type: fieldType(field.type) }));
    let readable = prompts.some(Boolean);

    for (const field of fields) {
      const label = normalize(field.label);
      const type = fieldType(field.type);
      const tokens = normalize(field.autocomplete).split(" ");
      const hint = tokens.at(-1) === "webauthn" ? tokens.at(-2) : tokens.at(-1);
      if (!label && !type && !hint) continue;
      readable = true;
      if (AGE_CONTROL_TYPE.test(type) || NON_ENTRY_TYPE.test(type)) {
        if (AGE_CONTROL_TYPE.test(type) && agePrompt(label)) kinds.add("age-check");
        continue;
      }
      const kind = fieldKind(label, type, hint);
      fieldKinds.push(kind);
      // A read may omit the required flag. Respect explicit optional facts when present.
      if (field.required === false || (field.required === undefined && OPTIONAL_LABEL.test(label))) continue;
      const requested = requestedKind(label, kind);
      if (!requested) continue;
      const value = field.value;
      if (value != null && !isString(value)) return unreadable;
      if (value == null || !/\S/.test(value)) kinds.add(requested);
    }

    for (const item of items) {
      const match = NUMBERED_ITEM.exec(item);
      if (!match) return unreadable;
      const role = normalize(match[1]);
      const type = role === "select" ? "select" : role.startsWith("field:") ? role.slice(6) : "";
      const ageControl = AGE_CONTROL_TYPE.test(type || role);
      const suffix = match[0].length;
      const filled = Boolean(type) && !ageControl && item.startsWith(" = ", suffix) && item.length > suffix + 3;
      // Friday can use the input value as a fallback label when it emits a value suffix.
      const label = filled ? "" : normalize(JSON.parse(match[2]));
      readable ||= Boolean(label || type);
      if (ageControl && agePrompt(label)) kinds.add("age-check");
      if (!type || ageControl || NON_ENTRY_TYPE.test(type) || filled) continue;

      const known = unmatchedFields.findIndex((field) => label && field.label === label && (!field.type || field.type === type));
      if (known !== -1) {
        unmatchedFields.splice(known, 1);
        continue;
      }
      const kind = fieldKind(label, type, undefined);
      fieldKinds.push(kind);
      // A numbered item carries no required flag. An empty personal field may gate the page.
      const requested = requestedKind(label, kind);
      if (requested && !OPTIONAL_LABEL.test(label)) kinds.add(requested);
    }

    if (!readable) return unreadable;
    if (prompts.some(agePrompt)) kinds.add("age-check");
    if (kinds.size) {
      return {
        action: "hold",
        reason: "This page asks for personal details or age confirmation. Wait for Amit.",
        kinds: DETAIL_KINDS.filter((kind) => kinds.has(kind)),
      };
    }
    if (fieldKinds.includes("typed-secret")) return { action: "go", reason: "Card and one-time-code fields belong to the typed-secret rule.", kinds: [] };
    if (fieldKinds.includes("email") && fieldKinds.includes("password") && fieldKinds.every((kind) => kind === "email" || kind === "password")) {
      return { action: "go", reason: "The sign-in form belongs to the signed-out rule.", kinds: [] };
    }
    if (fieldKinds.length && fieldKinds.every((kind) => kind === "search")) {
      return { action: "go", reason: "The browser lane can handle the search fields.", kinds: [] };
    }
    return { action: "go", reason: "No personal details or age confirmation are needed from Amit.", kinds: [] };
  } catch {
    // A malformed read can throw while its facts or quoted labels are read.
    return unreadable;
  }
}

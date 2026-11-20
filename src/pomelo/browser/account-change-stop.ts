export interface AccountChangeDecision {
  action: "go" | "hold";
  reason: string;
  signals: string[];
}

const RECOVERY_TOPIC = /^(?:(?:account )?recovery (?:e mail(?: address)?|phone(?: number)?|method|contact|option)|אמצעי שחזור|שיטת שחזור|(?:מספר )?טלפון לשחזור|(?:כתובת )?(?:אימייל|דואל|מייל) לשחזור)$/u;

const CHANGE_WORDING = Object.freeze([
  Object.freeze({
    signal: "email-change",
    english: /^(?:(?:(?:change|edit|update|replace) (?:the |your )?(?:account )?|(?:enter (?:a |your )?)?new )e mail(?: address)?|e mail(?: address)? (?:change|update))$/,
    hebrew: /^(?:(?:שינוי|עדכון|שנה|עדכן) (?:את )?(?:כתובת )?(?:האימייל|אימייל|המייל|מייל|הדואל|דואל|הדואר האלקטרוני|דואר אלקטרוני)|כתובת (?:דואל|אימייל|מייל|דואר אלקטרוני) חדשה)$/u,
    commit: /^(?:change|update|save (?:e mail(?: address)?)|שנה|עדכן)$/u,
  }),
  Object.freeze({
    signal: "phone-change",
    english: /^(?:(?:(?:change|edit|update|replace) (?:the |your )?(?:account )?|(?:enter (?:a |your )?)?new )(?:phone|mobile(?: phone)?)(?: number)?|(?:phone|mobile) number (?:change|update))$/,
    hebrew: /^(?:(?:שינוי|עדכון|שנה|עדכן) (?:את )?(?:מספר )?(?:הטלפון|טלפון|הנייד|נייד)|מספר (?:טלפון|נייד) חדש)$/u,
    commit: /^(?:change|update|save (?:(?:mobile|phone)(?: number)?)|שנה|עדכן)$/u,
  }),
  Object.freeze({
    signal: "two-step-off",
    english: /^(?:turn off|switch off|disable|deactivate|remove) (?:2fa|mfa|(?:2|two) step verification|(?:2|two|multi) factor (?:authentication|verification))$/,
    hebrew: /^(?:כיבוי|השבתת|ביטול|כבה|השבת|בטל) (?:את )?(?:אימות|האימות) (?:דו (?:שלבי|גורמי)|בשני שלבים|רב שלבי)$/u,
    commit: /^(?:turn off|switch off|disable|deactivate|remove|כבה|כיבוי|השבת|השבתה|בטל|ביטול)$/u,
    topic: /^(?:2fa|mfa|(?:2|two) step verification|(?:2|two|multi) factor (?:authentication|verification)|אימות (?:דו (?:שלבי|גורמי)|בשני שלבים|רב שלבי))$/u,
  }),
  Object.freeze({
    signal: "recovery-add",
    english: /^(?:add|set up) (?:a |an |new )?(?:(?:account )?recovery (?:e mail(?: address)?|phone(?: number)?|method|contact|option)|(?:e mail(?: address)?|phone(?: number)?) for (?:account )?recovery)$/,
    hebrew: /^(?:הוסף|הוספת|הגדרת) (?:אמצעי שחזור|שיטת שחזור|איש קשר לשחזור|(?:מספר )?טלפון לשחזור|(?:כתובת )?(?:אימייל|מייל|דואל|דואר אלקטרוני) לשחזור)(?: החשבון)?$/u,
    commit: /^(?:add|set up|הוסף|הוספה|הגדר)$/u,
    topic: RECOVERY_TOPIC,
  }),
  Object.freeze({
    signal: "recovery-change",
    english: /^(?:change|edit|update|replace|remove|delete) (?:your |the )?(?:account )?recovery (?:e mail(?: address)?|phone(?: number)?|method|contact|option)$/,
    hebrew: /^(?:שינוי|עדכון|הסרת|מחיקת|שנה|עדכן|הסר|מחק) (?:את )?(?:אמצעי (?:ה)?שחזור|שיטת (?:ה)?שחזור|איש קשר לשחזור|(?:מספר )?טלפון לשחזור|(?:כתובת )?(?:אימייל|מייל|דואל|דואר אלקטרוני) לשחזור)(?: החשבון)?$/u,
    commit: /^(?:change|update|remove|delete|שנה|עדכן|הסר|הסרה|מחק|מחיקה)$/u,
    topic: RECOVERY_TOPIC,
  }),
  Object.freeze({
    signal: "sign-out-all",
    english: /^(?:(?:sign|log) out (?:everywhere|(?:of |from )?all (?:your |other )?(?:devices|sessions))|(?:end|revoke) all sessions)$/,
    hebrew: /^(?:יציאה|צא|התנתקות|התנתק|נתק) (?:מכל (?:המכשירים|ההתקנים)|מכל מקום|מכל המכשירים האחרים)$/u,
    commit: /^(?:sign out|log out|end sessions|צא|יציאה|התנתק|התנתקות|נתק)$/u,
  }),
  Object.freeze({
    signal: "account-close",
    english: /^(?:(?:permanently )?(?:close|delete|deactivate|remove|cancel|terminate) (?:(?:the|your|this|my) )?account|account (?:closure|deletion|deactivation))$/,
    hebrew: /^(?:סגירת|מחיקת|השבתת|ביטול|סגור|מחק|השבת|בטל) (?:את )?(?:החשבון|חשבון)(?: שלי| שלך| לצמיתות)?$/u,
    commit: /^(?:close|delete|deactivate|remove|terminate|סגור|סגירה|מחק|מחיקה|השבת|השבתה|הסר|הסרה)$/u,
  }),
] as const);

const GENERAL_COMMIT = /^(?:save(?: changes)?|confirm(?: changes)?|apply(?: changes)?|submit|yes|שמור(?: שינויים| את השינויים)?|שמירה|אשר|אישור|החל|שלח|כן)$/u;
const DIRECT_COMMIT = /^(?:(?:change|update|replace|turn off|switch off|disable|deactivate|remove|add|set up|sign out|log out|end|revoke|close|delete|cancel|terminate|permanently)\b|(?:שינוי|עדכון|שנה|עדכן|כיבוי|השבתת|ביטול|כבה|השבת|בטל|הוסף|הוספת|הגדרת|הסרת|מחיקת|הסר|מחק|יציאה|צא|התנתקות|התנתק|נתק|סגירת|סגור) )/u;
const PROMPT_PREFIX = /^(?:are you sure you want to|do you want to|please|נא) /u;
const AFFIRMATIVE_PREFIX = /^(?:yes|כן), /u;

interface Control {
  kind: string;
  label: string;
  nearbyText?: string;
}

function normalize(text: string): string {
  return text.normalize("NFKD").replace(/[\p{M}\p{Cf}]/gu, "").toLowerCase()
    .replace(/•{4,}|\[secret hidden\]/g, " ").replace(/\p{Pd}/gu, " ")
    .replace(/["״“”]/g, "").replace(/\bemail\b/g, "e mail")
    .replace(/\s+/g, " ").trim().replace(/[.!?:…]+$/, "").trimEnd();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readText(value: unknown): string {
  if (value === undefined) return "";
  if (typeof value !== "string") throw new Error();
  return value;
}

function readList<T>(value: unknown, readItem: (item: unknown) => T): T[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error();
  return Array.from(value, readItem);
}

function readControl(value: unknown, kind = ""): Control {
  if (kind && typeof value === "string") return { kind, label: normalize(value) };
  if (!isRecord(value)) throw new Error();
  const { label, name, nearbyText } = value;
  const controlKind = kind || readElementKind(value);
  const controlLabel = label ?? name;
  if (!controlKind || (kind && controlLabel === undefined)) throw new Error();
  return {
    kind: controlKind,
    label: normalize(readText(controlLabel)),
    nearbyText: nearbyText === undefined ? undefined : readText(nearbyText),
  };
}

function readElementKind(value: Record<string, unknown>): string {
  const role = readText(value.role).trim().toLowerCase();
  const kind = readText(value.kind).trim().toLowerCase();
  const type = readText(value.type).trim().toLowerCase();
  if (role === "link" || kind === "link") return "link";
  if (type || (kind && kind !== "button")) return `field:${(type || kind).replace(/^field:/, "")}`;
  return role || kind;
}

function readFieldKind(value: unknown): Control {
  const type = readText(value).trim().toLowerCase().replace(/^field:/, "");
  if (!type) throw new Error();
  return { kind: `field:${type}`, label: "" };
}

function numberedControl(value: unknown): Control {
  // The quoted label ends before Friday's field value or link destination.
  const match = /^\[\d+\]\s+(\S+)\s+("(?:[^"\\]|\\.)*")(?=$| = | → )/i.exec(readText(value));
  if (!match) throw new Error();
  return { kind: match[1].toLowerCase(), label: normalize(JSON.parse(match[2]) as string) };
}

function promptLines(text: string): string[] {
  return text.split(/\r?\n/).map(normalize).filter(Boolean);
}

function unreadablePage(): AccountChangeDecision {
  return { action: "hold", reason: "Could not read the masked page. Amit needs to check it.", signals: ["unreadable-page"] };
}

/** Classifies masked page facts for the browser job's handoff to Amit. */
export function accountChangeStop(read: unknown): AccountChangeDecision {
  try {
    if (!isRecord(read)) return unreadablePage();
    const title = normalize(readText(read.title));
    const lines = promptLines(readText(read.text));
    const controls = [
      ...readList(read.buttons, (item) => readControl(item, "button")),
      ...readList(read.buttonLabels, (item) => readControl(item, "button")),
      ...readList(read.links, (item) => readControl(item, "link")),
      ...readList(read.linkLabels, (item) => readControl(item, "link")),
      ...readList(read.fields, (item) => readControl(item)),
      ...readList(read.fieldKinds, readFieldKind),
      ...readList(read.elements, (item) => readControl(item)),
      ...readList(read.items, numberedControl),
    ];
    if (!title && !lines.length && !controls.length) return unreadablePage();

    const linkLabels = new Set(controls.filter(({ kind }) => kind === "link").map(({ label }) => label));
    const fieldLabels = controls.filter(({ kind }) => /^field:(?:email|tel|text|number)$/.test(kind))
      .map(({ label }) => label);
    const pageContext = [title, ...lines.filter((line) => !linkLabels.has(line)), ...fieldLabels];
    const buttons = controls.filter(({ kind }) => /^(?:button|field:button|field:submit)$/.test(kind));
    const signals = CHANGE_WORDING.filter((rule) => {
      const matchesPrompt = (line: string) => {
        const wording = line.replace(PROMPT_PREFIX, "");
        return rule.english.test(wording) || rule.hebrew.test(wording);
      };
      return buttons.some(({ kind, label: rawLabel, nearbyText }) => {
        const label = rawLabel.replace(AFFIRMATIVE_PREFIX, "");
        if (DIRECT_COMMIT.test(label) && matchesPrompt(label)) return true;
        const specificCommit = rule.commit.test(label);
        const generalCommit = GENERAL_COMMIT.test(label) || (kind === "field:submit" && !label);
        if (!specificCommit && !generalCommit) return false;
        const context = nearbyText === undefined ? pageContext : promptLines(nearbyText);
        return context.some((line) => matchesPrompt(line)
          || (specificCommit && "topic" in rule && rule.topic.test(line)));
      });
    }).map(({ signal }) => signal);

    return signals.length
      ? { action: "hold", reason: "Amit needs to review this account change before it is applied.", signals }
      : { action: "go", reason: "No account-change form with a commit control was found.", signals };
  } catch {
    return unreadablePage();
  }
}

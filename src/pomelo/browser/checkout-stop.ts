interface CheckoutField {
  readonly label: string;
  /** May include autocomplete tokens such as `cc-number`. */
  readonly kind?: string;
}

interface CheckoutButton {
  readonly label: string;
  readonly nearbyText?: string;
}

export interface CheckoutPageRead {
  readonly title?: string;
  readonly text?: string;
  readonly fields?: readonly CheckoutField[];
  readonly buttons?: readonly CheckoutButton[];
  /** Friday's numbered read can supply control labels. */
  readonly items?: readonly string[];
}

export interface CheckoutDecision {
  action: "go" | "hold";
  reason: string;
  signals: string[];
}

const CARD_KIND = /(?:^|\s)cc-(?:number|exp(?:-month|-year)?|csc)(?=\s|$)/;
const CARD_LABEL = /\b(?:card[ -]+number|(?:card )?expir(?:y|ation)(?: date)?|(?:card )?security code|cvv2?|cvc2?|cid)\b|(?:^|[^\p{L}])(?:מספר (?:הכרטיס|כרטיס)|(?:תאריך )?תוקף|תאריך תפוגה|קוד (?:ה?אבטחה|ביטחון))(?!\p{L})/u;
const BILLING_KIND = /(?:^|\s)billing (?:street-address|address-line[123]|address-level[1-4]|postal-code|country(?:-name)?)(?=\s|$)/;
const BILLING_LABEL = /\bbilling address\b|כתובת (?:החיוב|לחיוב|למשלוח חשבונית)/u;
const BILLING_PROMPT = /^(?:(?:enter|provide|select|choose) (?:(?:a|the|your) )?billing address\b|(?:הזן|הזיני|הזינו|בחר|בחרי|בחרו) (?:את )?כתובת (?:החיוב|לחיוב)(?!\p{L}))/u;
const SAVED_CARDS = /^(?:saved (?:credit |payment )?cards?|(?:ה)?כרטיס(?:ים)? (?:ה)?שמור(?:ים)?)$/u;
const SAVED_CARD_PROMPT = /^(?:(?:choose|pick|select|use|pay with) (?:(?:a|the|your) )?saved (?:credit |payment )?cards?\b|(?:בחר(?:ו|י)?|השתמש(?:ו|י)?|שלם|שלמו) (?:את |ב|עם )?(?:ה)?כרטיס(?:ים)? (?:ה)?שמור(?:ים)?(?!\p{L}))/u;
const PAY_BUTTON = /^(?:pay(?: now)?|place (?:your |the )?order|buy now|confirm (?:your |the )?purchase|לתשלום(?: עכשיו)?|(?:שלם|שלמו)(?: עכשיו)?|בצע(?:ו|י)? (?:הזמנה|את ההזמנה)|קנה עכשיו|קנו עכשיו|רכוש עכשיו|אשר(?:ו|י)? רכישה)(?:$|(?=\s*[:–—$€£₪\d]))/u;
const ORDER_TOTAL = /^(?:(?:your )?(?:order total|grand total|purchase total|total due|total to pay|amount due)\b|(?:סך הכל|סך הכול|סך (?:ההזמנה|לתשלום)|סכום (?:ההזמנה|לתשלום)|סה["״']?כ)(?!\p{L})|total\s*:?\s*(?:[$€£₪]\s*\d|\d))/u;
const NUMBERED_CONTROL = /^\[\d+\]\s+(\S+)\s+("(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[\da-fA-F]{4}))*")(?=$| [→=] )/;
const BUTTON_KIND = /^(?:button|field:(?:button|submit|image))$/;
const FIELD_KIND = /^(?:field:(?!button$|submit$|image$|reset$)\S+|select)$/;
const TOTAL_LINE_RADIUS = 3;

function normalize(text: string): string {
  return text.normalize("NFKD").replace(/[\p{M}\p{Cf}]/gu, "").toLowerCase()
    .replace(/\s+/g, " ").trim().replace(/[.!?:…]+$/, "").trimEnd();
}

function normalizedLines(text: string): string[] {
  return text.split(/\r?\n/).map(normalize).filter(Boolean);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isList(value: unknown, valid: (item: unknown) => boolean): boolean {
  return value === undefined || (Array.isArray(value) && [...value].every(valid));
}

function isPageRead(value: unknown): value is CheckoutPageRead {
  return isRecord(value) && isOptionalString(value.title) && isOptionalString(value.text)
    && isList(value.fields, (item) => isRecord(item) && typeof item.label === "string" && isOptionalString(item.kind))
    && isList(value.buttons, (item) => isRecord(item) && typeof item.label === "string" && isOptionalString(item.nearbyText))
    && isList(value.items, (item) => typeof item === "string");
}

function numberedControls(items: readonly string[]): { kind: string; label: string }[] {
  return items.flatMap((item) => {
    // Only the quoted label belongs to the control wording.
    const match = NUMBERED_CONTROL.exec(item);
    if (!match) return [];
    return [{ kind: normalize(match[1]), label: JSON.parse(match[2]) as string }];
  });
}

function totalNearButton(button: CheckoutButton, label: string, lines: readonly string[]): boolean {
  if (button.nearbyText !== undefined) return normalizedLines(button.nearbyText).some((line) => ORDER_TOTAL.test(line));

  const positions = lines.flatMap((line, index) => line === label ? [index] : []);
  // A short read can omit the label from its text while still showing the same summary.
  if (positions.length === 0) return lines.length <= TOTAL_LINE_RADIUS && lines.some((line) => ORDER_TOTAL.test(line));
  return positions.some((index) => lines.slice(Math.max(0, index - TOTAL_LINE_RADIUS), index + TOTAL_LINE_RADIUS + 1)
    .some((line) => ORDER_TOTAL.test(line)));
}

/** Classify a masked page read for the browser job's handoff to Amit. */
export function checkoutStop(read?: unknown): CheckoutDecision {
  const unreadable: CheckoutDecision = { action: "hold", reason: "A readable masked page read is required.", signals: [] };
  if (!isPageRead(read)) return unreadable;

  const { title = "", text = "", fields = [], buttons = [], items = [] } = read;
  const numbered = numberedControls(items);
  const allFields = [...fields, ...numbered.filter(({ kind }) => FIELD_KIND.test(kind))];
  const buttonLabels = new Set(buttons.map(({ label }) => normalize(label)));
  const allButtons = [...buttons, ...numbered.filter(({ kind, label }) => BUTTON_KIND.test(kind) && !buttonLabels.has(normalize(label)))];
  const lines = normalizedLines(text);
  const pageWording = [normalize(title), ...lines];
  const fieldLabels = allFields.map(({ label }) => normalize(label));
  const controlLabels = [...fieldLabels, ...allButtons.map(({ label }) => normalize(label))];
  const signals: string[] = [];

  if (fieldLabels.some((label) => CARD_LABEL.test(label))
    || allFields.some(({ kind }) => CARD_KIND.test(normalize(kind ?? "")))) signals.push("card-field");
  if (fieldLabels.some((label) => BILLING_LABEL.test(label))
    || allFields.some(({ kind }) => BILLING_KIND.test(normalize(kind ?? "")))
    || pageWording.some((line) => BILLING_PROMPT.test(line))) signals.push("billing-address");
  if (controlLabels.some((label) => SAVED_CARDS.test(label) || SAVED_CARD_PROMPT.test(label))
    || pageWording.some((line) => SAVED_CARD_PROMPT.test(line))) signals.push("saved-card");
  if (allButtons.some((button) => {
    const label = normalize(button.label);
    return PAY_BUTTON.test(label) && totalNearButton(button, label, lines);
  })) signals.push("pay-button", "order-total");

  if (signals.length) return { action: "hold", reason: "Amit needs to handle this checkout step.", signals };
  if (![...pageWording, ...controlLabels, ...numbered.map(({ label }) => normalize(label)),
    ...buttons.map(({ nearbyText }) => normalize(nearbyText ?? ""))].some(Boolean)) return unreadable;
  return { action: "go", reason: "The masked page read shows no checkout step.", signals };
}

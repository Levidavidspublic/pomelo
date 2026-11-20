type ApprovalFields = Readonly<{
  id: string;
  kind: "fill" | "import";
  action: string;
  origin: string;
  frameOrigin: string;
  accountLabel: string;
  sites?: readonly string[];
  expiresAt: number;
}>;

export type ApprovalEditResult =
  | {
    status: "allowed";
    newApproval: ApprovalFields & { state: "pending" };
    oldApproval: ApprovalFields & { state: "replaced"; replacedBy: string };
  }
  | { status: "refused"; reason: string };

const requestFields = ["approval", "edit", "fittingAccountLabels", "actor", "now", "newId"];
const editFields = ["accountLabel", "sites", "expiresAt", "kind", "action", "origin", "frameOrigin"];
const approvalFields = ["id", "state", "replacedBy", ...editFields];

function refused(reason: string): ApprovalEditResult {
  return { status: "refused", reason };
}

// Read only the declared data fields. This rejects extra payloads and never calls a getter.
function readRecord(input: unknown, fields: readonly string[]): Record<string, unknown> | undefined {
  if (input === null || typeof input !== "object") return;
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) return;

  const record: Record<string, unknown> = Object.create(null);
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== "string" || !fields.includes(key)) return;
    const field = Object.getOwnPropertyDescriptor(input, key);
    if (!field || !Object.hasOwn(field, "value")) return;
    record[key] = field.value;
  }
  return record;
}

function isText(input: unknown): input is string {
  return typeof input === "string" && input.trim().length > 0;
}

function isTime(input: unknown): input is number {
  return typeof input === "number" && Number.isFinite(input);
}

function readTextList(input: unknown): string[] | undefined {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) return;
  const length: unknown = Object.getOwnPropertyDescriptor(input, "length")?.value;
  if (typeof length !== "number" || Reflect.ownKeys(input).length !== length + 1) return;

  const items: string[] = [];
  for (let index = 0; index < length; index++) {
    const item = Object.getOwnPropertyDescriptor(input, index);
    if (!item || !Object.hasOwn(item, "value") || !isText(item.value)) return;
    items.push(item.value);
  }
  return items;
}

function comparableOrigin(input: unknown): string | undefined {
  if (typeof input !== "string") return;
  const parts = /^(https?:\/\/)(\[[\da-f:.]+\]|[^:/@%?#\\\s*\[\]\p{Cc}]+)(:\d+)?$/iu.exec(input);
  if (!parts || parts[0] !== input || !URL.canParse(input)) return;
  // Keep the original scheme and port spelling. URL parsing also canonicalizes those.
  return parts[1] + parts[2].toLowerCase() + (parts[3] ?? "");
}

/** The caller supplies the authenticated actor, origin-matched labels, and a fresh id. */
export function checkApprovalEdit(input: unknown): ApprovalEditResult {
  try {
    const request = readRecord(input, requestFields);
    if (!request) return refused("The approval edit request is invalid.");
    const { actor, newId, now } = request;
    if (actor !== "amit") return refused("Only Amit can edit an approval.");

    const approval = readRecord(request.approval, approvalFields);
    const edit = readRecord(request.edit, editFields);
    const fittingLabels = readTextList(request.fittingAccountLabels);
    if (!approval || !fittingLabels || !isTime(now) || !isText(newId)) {
      return refused("The approval edit request is invalid.");
    }
    if (!edit) return refused("The edit contains an unsupported field or invalid data.");
    if (approval.state !== "pending") return refused("Only a pending approval can be edited.");

    const { id, kind, action, origin, frameOrigin, accountLabel, expiresAt } = approval;
    const site = comparableOrigin(origin);
    const frame = comparableOrigin(frameOrigin);
    if (!isText(id) || (kind !== "fill" && kind !== "import") || !isText(action) ||
        typeof origin !== "string" || typeof frameOrigin !== "string" || !site || !frame ||
        !isText(accountLabel) || !isTime(expiresAt) || "replacedBy" in approval) {
      return refused("The pending approval is invalid.");
    }
    if (expiresAt <= now) return refused("The approval has expired.");
    if (newId === id) return refused("The replacement needs a fresh approval id.");

    if ("kind" in edit && edit.kind !== kind) return refused("The approval kind cannot change.");
    if ("action" in edit && edit.action !== action) return refused("The approval action cannot change.");
    if ("origin" in edit && comparableOrigin(edit.origin) !== site) return refused("The site cannot change.");
    if ("frameOrigin" in edit && comparableOrigin(edit.frameOrigin) !== frame) {
      return refused("The frame origin cannot change.");
    }

    const nextAccount = "accountLabel" in edit ? edit.accountLabel : accountLabel;
    if (!isText(nextAccount) || (nextAccount !== accountLabel && !fittingLabels.includes(nextAccount))) {
      return refused("Choose a saved account for this exact site.");
    }

    const sites = kind === "import" ? readTextList(approval.sites) : undefined;
    if (kind === "import" && !sites?.length) return refused("The import must have at least one site.");
    if (kind === "fill" && ("sites" in approval || "sites" in edit)) {
      return refused("Only an import approval can include a site list.");
    }
    let nextSites = sites?.slice();
    if (sites && "sites" in edit) {
      const requestedSites = readTextList(edit.sites);
      if (!requestedSites?.length || requestedSites.some((site) => !sites.includes(site))) {
        return refused("Keep at least one site from the original import.");
      }
      nextSites = sites.filter((site) => requestedSites.includes(site));
    }

    const requestedExpiry = "expiresAt" in edit ? edit.expiresAt : expiresAt;
    if (!isTime(requestedExpiry) || requestedExpiry <= now) return refused("Choose an expiry in the future.");

    const fields = { kind, action, origin, frameOrigin } as const;
    return {
      status: "allowed",
      oldApproval: { ...fields, id, state: "replaced", replacedBy: newId, accountLabel, expiresAt, ...(sites && { sites }) },
      newApproval: {
        ...fields,
        id: newId,
        state: "pending",
        accountLabel: nextAccount,
        expiresAt: Math.min(requestedExpiry, expiresAt),
        ...(nextSites && { sites: nextSites }),
      },
    };
  } catch {
    // Invalid objects such as revoked proxies can throw even during field inspection.
    return refused("The approval edit request is invalid.");
  }
}

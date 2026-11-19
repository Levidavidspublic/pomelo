export const IMPORT_SITE_RESULTS = Object.freeze(["imported", "expired", "incompatible", "skipped"] as const);
export type ImportResult = typeof IMPORT_SITE_RESULTS[number];

export interface ImportSiteResult {
  site: string;
  result: ImportResult;
}

export interface StartImportRunInput {
  sourceProfile: string;
  targetProfileId: string;
  /** Unix time in milliseconds. */
  startedAt: number;
}

export interface ImportRun extends StartImportRunInput {
  sites: ImportSiteResult[];
  endedAt?: number;
}

export type ImportRunSummary = Record<ImportResult, number> & { total: number };

const START_FIELDS = ["sourceProfile", "targetProfileId", "startedAt"];
const RUN_FIELDS = [...START_FIELDS, "sites", "endedAt"];
const SITE_FIELDS = ["site", "result"];
const HOST_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

function assertFields(value: unknown, fields: readonly string[]): void {
  if (value === null || typeof value !== "object") throw new Error("Expected import receipt fields");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new Error("Expected plain import receipt fields");
  for (const key of Reflect.ownKeys(value)) {
    const property = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== "string" || !fields.includes(key) || !property || !("value" in property)) {
      throw new Error("Unexpected import receipt fields");
    }
  }
}

function assertStartValues({ sourceProfile, targetProfileId, startedAt }: StartImportRunInput): void {
  if (typeof sourceProfile !== "string" || !sourceProfile.trim()) throw new Error("Expected a source profile label");
  if (typeof targetProfileId !== "string" || !targetProfileId.trim()) throw new Error("Expected a target profile ID");
  if (!Number.isFinite(startedAt)) throw new Error("Expected a finite startedAt timestamp");
}

function assertEndTime(startedAt: number, endedAt: unknown): void {
  if (typeof endedAt !== "number" || !Number.isFinite(endedAt)) throw new Error("Expected a finite endedAt timestamp");
  if (endedAt < startedAt) throw new Error("Cannot finish an import run before it started");
}

function siteResult(site: string, result: ImportResult): ImportSiteResult {
  if (typeof site !== "string") throw new Error("Expected a hostname for the import site");
  const host = site.replace(/\.$/, "");
  if (host.length > 253 || !host.split(".").every((label) => HOST_LABEL.test(label))) {
    throw new Error("Expected a hostname for the import site");
  }
  if (!IMPORT_SITE_RESULTS.includes(result)) throw new Error("Unknown import site result");
  return { site: host.toLowerCase(), result };
}

/** Validate and copy the receipt before using it, including receipts read back from JSON. */
function copyRun(run: ImportRun): ImportRun {
  assertFields(run, RUN_FIELDS);
  const { sourceProfile, targetProfileId, startedAt, endedAt, sites } = run;
  assertStartValues(run);
  if (Object.hasOwn(run, "endedAt")) assertEndTime(startedAt, endedAt);

  // A receipt's list must be dense and contain only its indexed entries.
  if (!Array.isArray(sites) || Reflect.ownKeys(sites).length !== sites.length + 1) {
    throw new Error("Expected a list of import sites");
  }
  const copiedSites: ImportSiteResult[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < sites.length; index++) {
    const property = Object.getOwnPropertyDescriptor(sites, index);
    if (!property || !("value" in property)) throw new Error("Expected a list of import sites");
    const entry: ImportSiteResult = property.value;
    assertFields(entry, SITE_FIELDS);
    const checked = siteResult(entry.site, entry.result);
    if (seen.has(checked.site)) throw new Error("Duplicate hostname in import sites");
    seen.add(checked.site);
    copiedSites.push(checked);
  }

  return {
    sourceProfile, targetProfileId, sites: copiedSites, startedAt,
    ...(endedAt === undefined ? {} : { endedAt }),
  };
}

export function importRunKey(id: string): string {
  if (typeof id !== "string" || !id.trim()) throw new Error("Expected an import run ID");
  return `pomelo:import:${id}`;
}

export function startImportRun(input: StartImportRunInput): ImportRun {
  assertFields(input, START_FIELDS);
  assertStartValues(input);
  const { sourceProfile, targetProfileId, startedAt } = input;
  return { sourceProfile, targetProfileId, sites: [], startedAt };
}

export function addSiteResult(run: ImportRun, site: string, result: ImportResult): ImportRun {
  const updated = copyRun(run);
  if (updated.endedAt !== undefined) throw new Error("Cannot add a site to a finished import run");
  const entry = siteResult(site, result);
  const index = updated.sites.findIndex((previous) => previous.site === entry.site);
  if (index === -1) updated.sites.push(entry);
  else updated.sites[index] = entry;
  return updated;
}

export function finishImportRun(run: ImportRun, endedAt: number): ImportRun {
  const finished = copyRun(run);
  if (finished.endedAt !== undefined) throw new Error("Import run is already finished");
  assertEndTime(finished.startedAt, endedAt);
  finished.endedAt = endedAt;
  return finished;
}

export function summariseImportRun(run: ImportRun): ImportRunSummary {
  const { sites } = copyRun(run);
  const summary = { imported: 0, expired: 0, incompatible: 0, skipped: 0, total: sites.length };
  for (const { result } of sites) summary[result]++;
  return summary;
}

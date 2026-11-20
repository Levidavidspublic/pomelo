export const CANARY_SURFACES = Object.freeze(["model-input", "logs", "bus", "storage"] as const);
export type CanarySurface = (typeof CANARY_SURFACES)[number];

export type CanaryHitPlace = { file: string; line: number } | { eventId: string; field: string };

export interface CanaryScanResult {
  surface: CanarySurface;
  ran: boolean;
  itemsScanned: number;
  hitCount: number;
  /** Location metadata only. Scanners must redact any canary text before reporting a location. */
  hitPlaces: readonly CanaryHitPlace[];
}

const OMITTED_LOCATION = "[location omitted]";
const MAX_LOCATION_LENGTH = 200;

export interface CanaryVerdict {
  verdict: "clean" | "leak" | "not-proven";
  hitsBySurface: Partial<Record<CanarySurface | "unknown", (CanaryHitPlace | typeof OMITTED_LOCATION)[]>>;
  issues: string[];
  summary: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function copyHitPlace(place: unknown): CanaryHitPlace | typeof OMITTED_LOCATION {
  if (!isRecord(place)) return OMITTED_LOCATION;
  const { file, line, eventId, field } = place;
  if (typeof file === "string" && isCount(line) && line > 0) {
    return file.length <= MAX_LOCATION_LENGTH ? { file, line } : OMITTED_LOCATION;
  }
  if (typeof eventId === "string" && typeof field === "string") {
    return eventId.length + field.length <= MAX_LOCATION_LENGTH ? { eventId, field } : OMITTED_LOCATION;
  }
  return OMITTED_LOCATION;
}

export function canaryVerdict(results: unknown): CanaryVerdict {
  const hitsBySurface: CanaryVerdict["hitsBySurface"] = {};
  const issues = new Set<string>();
  const seen = new Set<CanarySurface>();
  const isScanArray = Array.isArray(results);
  const scans: readonly unknown[] = isScanArray ? results : [];
  if (!isScanArray) issues.add("scan results must be an array");

  for (const scan of scans) {
    if (!isRecord(scan)) {
      issues.add("invalid scan result");
      continue;
    }

    const { surface, ran, itemsScanned, hitCount, hitPlaces } = scan;
    const knownSurface = CANARY_SURFACES.find((name) => name === surface);
    if (knownSurface === undefined) {
      issues.add("unknown surface");
    } else {
      if (seen.has(knownSurface)) issues.add(`${knownSurface} listed twice`);
      seen.add(knownSurface);
      if (ran !== true) issues.add(`${knownSurface} did not run`);
      if (!isCount(itemsScanned)) issues.add(`${knownSurface} has an invalid item count`);
      else if (itemsScanned === 0) issues.add(`${knownSurface} scanned zero items`);
      if (!isCount(hitCount) || !Array.isArray(hitPlaces)) issues.add(`${knownSurface} has invalid hit data`);
    }

    const places: readonly unknown[] = Array.isArray(hitPlaces) ? hitPlaces : [];
    // Either signal can report a hit, even if the scanner's other fields disagree.
    if ((isCount(hitCount) && hitCount > 0) || places.length > 0) {
      const surfaceHits = (hitsBySurface[knownSurface ?? "unknown"] ??= []);
      for (const place of places) surfaceHits.push(copyHitPlace(place));
    }
  }

  for (const surface of CANARY_SURFACES) {
    if (!seen.has(surface)) issues.add(`${surface} missing`);
  }

  const surfacesWithHits = Object.keys(hitsBySurface);
  const details = [...issues];
  if (surfacesWithHits.length > 0) {
    const coverage = details.length > 0 ? `. ${details.join(", ")}` : "";
    return {
      verdict: "leak",
      hitsBySurface,
      issues: details,
      summary: `leak — hits reported on ${surfacesWithHits.join(", ")}${coverage}.`,
    };
  }
  if (details.length > 0) {
    return { verdict: "not-proven", hitsBySurface, issues: details, summary: `not-proven — ${details.join(", ")}.` };
  }
  return { verdict: "clean", hitsBySurface, issues: details, summary: "clean — zero hits across all four surfaces." };
}

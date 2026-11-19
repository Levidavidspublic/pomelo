import type { ImportResult, ImportRun, ImportSiteResult } from "../../pomelo/import-run.js";

const wizardSteps = [
  ["extension", "Install and pair the Chrome companion extension"],
  ["source", "Choose the Chrome profile and sites"],
  ["target", "Choose the Pomelo profile"],
  ["running", "Run import"],
  ["results", "Review results"],
] as const;

const resultDisplay = {
  imported: { label: "Imported", tone: "good" },
  expired: { label: "Expired (sign in again in Chrome)", tone: "warn" },
  incompatible: { label: "Incompatible (device-bound)", tone: "bad" },
  skipped: { label: "Skipped", tone: "warn" },
} as const satisfies Record<ImportResult, { label: string; tone: string }>;

type WizardStep = typeof wizardSteps[number][0];
type StepState = "complete" | "current" | "upcoming";
type ReceiptSite = Pick<ImportSiteResult, "site"> & { result: unknown };
type WizardRow = ImportSiteResult & typeof resultDisplay[ImportResult];

interface ImportWizardInput {
  extensionPaired: boolean;
  sourceProfile?: string | null;
  sites: readonly string[];
  targetProfileId?: string | null;
  profiles: readonly { id: string; location: "local" | "cloud" }[];
  run?: Partial<Pick<ImportRun, "targetProfileId">> & {
    endedAt?: ImportRun["endedAt"] | null;
    sites: readonly ReceiptSite[];
  } | null;
}

function isImportResult(result: unknown): result is ImportResult {
  return typeof result === "string" && Object.hasOwn(resultDisplay, result);
}

function importRows(pickedSites: readonly string[], receiptSites: readonly ReceiptSite[]): WizardRow[] {
  const resultsBySite = new Map(receiptSites.map(({ site, result }) => [site, result]));
  const rows = pickedSites.map((pickedSite) => {
    const site = typeof pickedSite === "string" ? pickedSite : "Unknown site";
    // The receipt stores hostnames in lowercase without a trailing dot.
    const rawResult = resultsBySite.get(site.replace(/\.$/, "").toLowerCase());
    const result = isImportResult(rawResult) ? rawResult : "skipped";
    return { site, result, ...resultDisplay[result] };
  });
  return rows.sort((a, b) => Number(a.result === "imported") - Number(b.result === "imported"));
}

function resultsHeadline(rows: readonly WizardRow[]): string {
  if (!rows.length) return "No site results available";

  const counts = { imported: 0, expired: 0, incompatible: 0, skipped: 0 };
  for (const { result } of rows) counts[result]++;
  if (counts.imported === rows.length) return `All ${rows.length} sites imported`;

  const summary = [`${counts.imported} of ${rows.length} imported`];
  for (const result of ["expired", "incompatible", "skipped"] as const) {
    if (counts[result]) summary.push(`${counts[result]} ${result}`);
  }
  return summary.join(" · ");
}

export function importWizard({ extensionPaired, sourceProfile, sites, targetProfileId, profiles, run }: ImportWizardInput) {
  const targetId = run?.targetProfileId ?? targetProfileId;
  const target = profiles.find(({ id }) => id === targetId);
  let step: WizardStep;
  let nextLabel: string | null = "Continue";
  let blockedReason: string | null = null;
  let headline: string | null = null;
  let rows: WizardRow[] = [];

  if (run) {
    nextLabel = null;
    if (run.endedAt == null) {
      step = "running";
      headline = "Importing sites…";
    } else {
      step = "results";
      rows = importRows(sites, run.sites);
      headline = resultsHeadline(rows);
    }
  } else if (!extensionPaired) {
    step = "extension";
    blockedReason = "Pair the Chrome companion extension.";
  } else if (!sourceProfile?.trim()) {
    step = "source";
    blockedReason = "Choose a Chrome profile.";
  } else if (!sites.length) {
    step = "source";
    blockedReason = "Choose at least one site to import.";
  } else if (!target) {
    step = "target";
    blockedReason = "Choose a Pomelo profile.";
  } else {
    step = "running";
    nextLabel = "Run import";
  }

  const current = wizardSteps.findIndex(([id]) => id === step);
  const steps = wizardSteps.map(([id, label], index) => {
    const state: StepState = index < current ? "complete" : index === current ? "current" : "upcoming";
    return { id, label, state };
  });
  return {
    step,
    steps,
    canNext: blockedReason === null && nextLabel !== null,
    nextLabel,
    blockedReason,
    headline,
    rows,
    ...(target?.location === "cloud" ? { vps: true as const } : {}),
  };
}

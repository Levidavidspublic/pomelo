type ChangedFile = {
  path: string;
  status?: "added" | "modified" | "deleted" | "renamed";
  previousPath?: string;
};

type Reason =
  | "Test is outside test/"
  | "Test is in a subfolder of test/"
  | "Test must end in .test.ts"
  | "Pomelo test must be named test/pomelo-<name>.test.ts";

type Finding = { file: string; reason: Reason };

const runnableTest = /^test\/[^/]*\.test\.ts$/;
const testEnding = /\.(?:test|spec)\.(?:[cm]?[jt]s|[jt]sx)$/i;
const pomeloTest = /^test\/pomelo-[^/]+\.test\.ts$/;

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

/** Report added or renamed tests by their normalized destination path. */
export function testPlaceFindings(files: readonly ChangedFile[]): Finding[] {
  const findings: Finding[] = [];

  for (const { path, status, previousPath } of files) {
    if (status === "modified" || status === "deleted") continue;

    const file = normalizePath(path);
    // A rename can hide an existing test behind a fixture path or a helper name.
    const wasRunnable = previousPath !== undefined && runnableTest.test(normalizePath(previousPath));
    if (!wasRunnable && (file.startsWith("test/fixtures/") || !testEnding.test(file))) continue;

    if (!file.startsWith("test/")) {
      findings.push({ file, reason: "Test is outside test/" });
    } else if (file.indexOf("/", "test/".length) !== -1) {
      findings.push({ file, reason: "Test is in a subfolder of test/" });
    } else if (!file.endsWith(".test.ts")) {
      findings.push({ file, reason: "Test must end in .test.ts" });
    } else if (!pomeloTest.test(file)) {
      findings.push({ file, reason: "Pomelo test must be named test/pomelo-<name>.test.ts" });
    }
  }

  return findings;
}

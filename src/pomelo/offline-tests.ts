type ChangedFile = {
  path: string;
  added: readonly { line: number; text: string }[];
};

type Finding = {
  file: string;
  line: number;
  reason: string;
};

const POMELO_TEST = /^test\/pomelo-[^/]*\.test\.ts$/;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const ADDRESS = /\b(?:https?|wss?):\/\/[^\s"'`<>]+/gi;
const PACKAGE_INSTALL = /(?:^|[\s"'`;&|(])(?:npx(?=\s+\S)|npm\s+install|pnpm\s+add|yarn\s+add)(?=$|[\s"'`;&|)])/;

function hasRemoteAddress(text: string): boolean {
  for (const [address] of text.matchAll(ADDRESS)) {
    try {
      if (!LOOPBACK_HOSTS.has(new URL(address).hostname)) return true;
    } catch {
      // An incomplete or malformed address does not name a host.
    }
  }
  return false;
}

/** Check added lines for literal URLs and package install commands. */
export function offlineTestFindings(files: readonly ChangedFile[]): Finding[] {
  const findings: Finding[] = [];
  for (const { path, added } of files) {
    if (!POMELO_TEST.test(path) && !path.startsWith("src/pomelo/") && !path.startsWith("src/client/pomelo/")) continue;

    for (const { line, text } of added) {
      if (hasRemoteAddress(text)) findings.push({ file: path, line, reason: "Remote URL" });
      else if (PACKAGE_INSTALL.test(text)) findings.push({ file: path, line, reason: "Package install command" });
    }
  }
  return findings;
}

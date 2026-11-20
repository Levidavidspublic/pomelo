type AddedFile = {
  path: string;
  added: readonly { line: number; text: string }[];
};

const NETWORK_MODULES = "(?:(?:node:)?(?:https?|net|tls|dgram)|undici)";
const MODULE_SPECIFIER = new RegExp(`^${NETWORK_MODULES}$`);

export const OUTBOUND_RULES = [
  { name: "fetch", pattern: /(?<![$\p{ID_Continue}\u200c\u200d])fetch\s*\(/u },
  { name: "WebSocket", pattern: /(?<![$\p{ID_Continue}\u200c\u200d])new\s+WebSocket\s*\(/u },
  { name: "EventSource", pattern: /(?<![$\p{ID_Continue}\u200c\u200d])new\s+EventSource\s*\(/u },
  { name: "XMLHttpRequest", pattern: /(?<![$\p{ID_Continue}\u200c\u200d])\bXMLHttpRequest(?![$\p{ID_Continue}\u200c\u200d])/u },
  { name: "navigator.sendBeacon", pattern: /(?<![$\p{ID_Continue}\u200c\u200d])navigator\s*\.\s*sendBeacon(?![$\p{ID_Continue}\u200c\u200d])/u },
  { name: "network-module", pattern: new RegExp(String.raw`(?<![$\p{ID_Continue}\u200c\u200d])(?:(?:import|require)\s*\(\s*|import\s*|from\s*)(["'\x60])${NETWORK_MODULES}\1`, "u") },
] as const;

type Finding = {
  path: string;
  line: number;
  rule: (typeof OUTBOUND_RULES)[number]["name"];
  loopback: boolean;
};

const TEST_PATH = /(?:^|\/)(?:__tests__|tests?)\/|\.(?:test|spec)\.[^/.]+$/;
const STRING_OR_COMMENT = /(["'`])(?:\\.|(?!\1)[^\\])*\1|\/\/.*|\/\*.*?(?:\*\/|$)/g;
// Read raw URL authorities and quoted host literals so URL normalization cannot turn another spelling into loopback.
const ADDRESS = /(?:\b[a-z][a-z\d+.-]*:\/\/|["'`]\s*\/\/)([^\s"'`/?#<>]*)|(["'`])((?:[\w-]+(?:\.[\w-]+)+|localhost|\[[\da-f:]+\])(?::\d+)?)\2/gi;
const LOOPBACK = /^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/i;

/** Report the network rules matched by added lines in Pomelo source files. */
export function outboundCalls(files: readonly AddedFile[], allow: readonly string[] = []): Finding[] {
  const allowedPaths = new Set(allow);
  const findings: Finding[] = [];

  for (const { path, added } of files) {
    if (!path.startsWith("src/pomelo/") && !path.startsWith("src/client/pomelo/")) continue;
    if (allowedPaths.has(path) || TEST_PATH.test(path)) continue;

    for (const { line, text } of added) {
      // A diff may include a doc comment's continuation without its opening line.
      if (text.trimStart().startsWith("*")) continue;
      const code = text.replace(STRING_OR_COMMENT, (token, quote: string | undefined) => quote ? token : " ");
      // Keep the string contents that can affect rule matching.
      const source = code.replace(STRING_OR_COMMENT, (token, quote: string | undefined) =>
        (quote === "`" && token.includes("${")) || MODULE_SPECIFIER.test(token.slice(1, -1)) ? token : "''",
      );
      const rules = OUTBOUND_RULES.filter(({ pattern }) => pattern.test(source));
      if (rules.length === 0) continue;

      const addresses = [...code.matchAll(ADDRESS)];
      const loopback = addresses.length > 0 && addresses.every(([, authority, , host]) => LOOPBACK.test(authority ?? host));
      for (const { name } of rules) findings.push({ path, line, rule: name, loopback });
    }
  }

  return findings;
}

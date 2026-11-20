import posix from "node:path/posix";

export const LAYER_RULES = Object.freeze([
  "client-node",
  "client-server",
  "server-client",
  "src-test",
  "deep-escape",
] as const);

type LayerRule = (typeof LAYER_RULES)[number];

type ChangedFile = {
  path: string;
  added: readonly { line: number; text: string }[];
};

type Finding = {
  path: string;
  line: number;
  rule: LayerRule;
};

const SERVER_POMELO = "src/pomelo/";
const CLIENT_POMELO = "src/client/pomelo/";
const CLIENT = "src/client";

// Builtins that Node also accepts without the node: prefix.
const BARE_BUILTINS: readonly string[] = Object.freeze([
  "_http_agent", "_http_client", "_http_common", "_http_incoming", "_http_outgoing", "_http_server",
  "_stream_duplex", "_stream_passthrough", "_stream_readable", "_stream_transform", "_stream_wrap",
  "_stream_writable", "_tls_common", "_tls_wrap", "assert", "assert/strict", "async_hooks", "buffer",
  "child_process", "cluster", "console", "constants", "crypto", "dgram", "diagnostics_channel",
  "dns", "dns/promises", "domain", "events", "fs", "fs/promises", "http", "http2", "https",
  "inspector", "inspector/promises", "module", "net", "os", "path", "path/posix", "path/win32",
  "perf_hooks", "process", "punycode", "querystring", "readline", "readline/promises", "repl",
  "stream", "stream/consumers", "stream/promises", "stream/web", "string_decoder", "sys", "timers",
  "timers/promises", "tls", "trace_events", "tty", "url", "util", "util/types", "v8", "vm",
  "wasi", "worker_threads", "zlib",
]);

const IMPORT = /(?<![\w$.])import\b(?:\s*(?<bindings>[\w${},*\s]+?)\s*\bfrom\b)?\s*(?<importQuote>["'])(?<importPath>[^"']+)\k<importQuote>/;
const REEXPORT = /(?<![\w$.])export\b(?<exportType>\s+type\b)?\s*(?:\{[^}]*\}|\*(?:\s+as\s+[\w$]+)?)\s*from\s*(?<exportQuote>["'])(?<exportPath>[^"']+)\k<exportQuote>/;
const LOAD_CALL = /(?<![\w$.])(?:import|require)\s*\(\s*(?<callQuote>["'])(?<callPath>[^"']+)\k<callQuote>\s*(?=[,)])/;
const COMMENT = /\/\/.*|\/\*.*?(?:\*\/|(?<unclosedComment>$))/;
const STRING = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\x60(?:\\.|[^\x60\\])*\x60/;

// Consume comments and strings as whole tokens before scanning any later code on the line.
const LINE_TOKENS = new RegExp([COMMENT, STRING, IMPORT, REEXPORT, LOAD_CALL].map((pattern) => pattern.source).join("|"), "g");

function layerRule(path: string, client: boolean, specifier: string, typeOnly: boolean): LayerRule | undefined {
  if (client && (specifier.startsWith("node:") || BARE_BUILTINS.includes(specifier))) return "client-node";

  const relative = /^(?:\.{1,2})(?:\/|$)/.test(specifier);
  const target = relative
    ? posix.join(posix.dirname(path), specifier)
    : specifier.startsWith("@/") ? posix.join(CLIENT, specifier.slice(2)) : undefined;
  if (!target) return;

  // Give test imports the specific rule even though test/ sits outside src/.
  if (target === "test" || target.startsWith("test/")) return "src-test";
  if (relative && target !== "src" && !target.startsWith("src/")) return "deep-escape";
  if (target === CLIENT || target.startsWith(`${CLIENT}/`)) return client ? undefined : "server-client";

  if (!client || typeOnly || !relative) return;

  // Friday uses .js specifiers for the TypeScript modules at the top of src/.
  const topLevelModule = /^src\/[^/]+\.[cm]?[jt]sx?$/.test(target) || /^src\/[^/.]+$/.test(target);
  if (target.startsWith(SERVER_POMELO) || topLevelModule) {
    return "client-server";
  }
}

/** Check literal imports whose specifiers and import syntax appear on the same added line. */
export function importLayers(files: readonly ChangedFile[]): Finding[] {
  const findings: Finding[] = [];

  for (const { path, added } of files) {
    const client = path.startsWith(CLIENT_POMELO);
    if (!client && !path.startsWith(SERVER_POMELO)) continue;

    let openCommentLine: number | undefined;
    for (const { line, text } of added) {
      let code = text;
      if (openCommentLine === line - 1) {
        const end = text.indexOf("*/");
        if (end === -1) {
          openCommentLine = line;
          continue;
        }
        code = text.slice(end + 2);
      }
      openCommentLine = undefined;
      if (/^\s*\*/.test(code)) continue;
      const rules = new Set<LayerRule>();

      for (const { groups } of code.matchAll(LINE_TOKENS)) {
        if (groups?.unclosedComment !== undefined) openCommentLine = line;
        const specifier = groups?.importPath ?? groups?.exportPath ?? groups?.callPath;
        if (!specifier) continue;

        const bindings = groups?.bindings?.trim() ?? "";
        const typeOnly = Boolean(groups?.exportType) || /^type\b(?!\s*(?:,|$))/.test(bindings);
        const rule = layerRule(path, client, specifier, typeOnly);
        if (rule) rules.add(rule);
      }

      for (const rule of rules) findings.push({ path, line, rule });
    }
  }

  return findings;
}

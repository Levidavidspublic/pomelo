import { parser } from "@lezer/javascript";
import { createScanner } from "typescript/unstable/ast/scanner";

type ChangedFile = {
  path: string;
  added: readonly { line: number; text: string }[];
};

type EnvRead = {
  path: string;
  line: number;
  name: string;
  reason: "not-allowed" | "whole-object" | "dynamic-name";
};

const TEST_PATH = /(?:^|\/)(?:test|tests|__tests__)\/|\.(?:test|spec)\.[^/]+$/;
const ts = parser.configure({ dialect: "ts" });
const tsx = parser.configure({ dialect: "ts jsx" });
type SyntaxNode = ReturnType<typeof parser.parse>["topNode"];

function sibling(node: SyntaxNode | null, direction: "nextSibling" | "prevSibling"): SyntaxNode | null {
  let adjacent = node?.[direction] ?? null;
  while (adjacent?.name === "LineComment" || adjacent?.name === "BlockComment") adjacent = adjacent[direction];
  return adjacent;
}

function wrappedExpression(node: SyntaxNode): SyntaxNode | null {
  switch (node.name) {
    case "ParenthesizedExpression": return sibling(node.getChild("("), "nextSibling");
    case "PrefixCast": return node.lastChild;
    case "BinaryExpression": return node.getChild("as") || node.getChild("satisfies") ? node.firstChild : null;
    // A postfix expression with a logic operator is a TypeScript non-null assertion.
    case "PostfixExpression": return node.getChild("LogicOp") ? node.firstChild : null;
    default: return null;
  }
}

function unwrap(node: SyntaxNode | null): SyntaxNode | null {
  if (!node) return null;
  let inner: SyntaxNode | null;
  while ((inner = wrappedExpression(node))) node = inner;
  return node;
}

function outerExpression(node: SyntaxNode): SyntaxNode {
  let parent = node.parent;
  while (parent && wrappedExpression(parent)?.from === node.from) {
    node = parent;
    parent = node.parent;
  }
  return node;
}

function isWriteOnly(node: SyntaxNode): boolean {
  const parent = node.parent;
  if (parent?.name === "UnaryExpression") return parent.firstChild?.name === "delete";
  return parent?.name === "AssignmentExpression" && sibling(node, "nextSibling")?.name === "Equals";
}

function propertyName(key: SyntaxNode | null, source: string): string | undefined {
  const node = unwrap(key);
  if (!node) return undefined;
  const text = source.slice(node.from, node.to);
  if (node.name === "TemplateString" && node.getChild("Interpolation")) return undefined;
  switch (node.name) {
    case "PropertyName":
    case "VariableDefinition": return text;
    case "TemplateString":
    case "String":
    case "Number": {
      // The existing TypeScript scanner decodes escapes without evaluating source.
      const scanner = createScanner(true, undefined, text);
      scanner.scan();
      return scanner.getTokenValue();
    }
    default: return undefined;
  }
}

function memberKey(node: SyntaxNode): SyntaxNode | null {
  const bracket = node.getChild("[");
  return bracket ? sibling(bracket, "nextSibling") : node.getChild("PropertyName");
}

function scan(source: string, path: string, allowedNames: ReadonlySet<string>) {
  const reads: (Pick<EnvRead, "name" | "reason"> & { offset: number })[] = [];
  const tree = (/\.[jt]sx$/.test(path) ? tsx : ts).parse(source);

  function reportKey(key: SyntaxNode | null, offset: number) {
    const name = propertyName(key, source);
    if (name === undefined) reads.push({ offset, name: "*", reason: "dynamic-name" });
    else if (!allowedNames.has(name)) reads.push({ offset, name, reason: "not-allowed" });
  }

  tree.iterate({ enter({ name, node }) {
    if (name !== "MemberExpression" || propertyName(memberKey(node), source) !== "env") return;
    const base = unwrap(node.firstChild);
    const baseName = propertyName(base?.getChild("PropertyName") ?? null, source);
    const isImportMeta = base?.name === "ImportMeta" && baseName === "meta";
    const isProcess = base?.name === "VariableName" && source.slice(base.from, base.to) === "process";
    if (!isImportMeta && !isProcess) return;

    const expression = outerExpression(node);
    const parent = expression.parent;
    if (isWriteOnly(expression)) return;

    if (parent?.name === "MemberExpression" && parent.firstChild?.from === expression.from) {
      if (isWriteOnly(outerExpression(parent))) return;
      const key = memberKey(parent);
      reportKey(key, key?.from ?? node.from);
      return;
    }

    const equals = sibling(expression, "prevSibling");
    let pattern = equals?.name === "Equals" ? sibling(equals, "prevSibling") : null;
    if (pattern?.name === "TypeAnnotation") pattern = sibling(pattern, "prevSibling");
    if (pattern?.name === "ObjectPattern") {
      for (const property of pattern.getChildren("PatternProperty")) {
        const first = property.firstChild;
        if (first?.name === "Spread") reads.push({ offset: first.from, name: "*", reason: "whole-object" });
        else reportKey(first?.name === "[" ? sibling(first, "nextSibling") : first, property.from);
      }
      return;
    }

    reads.push({ offset: node.from, name: "*", reason: "whole-object" });
  } });

  return reads.sort((a, b) => a.offset - b.offset);
}

/** Report environment reads visible in the added lines. A custom allowlist replaces the defaults. */
export function findEnvReads(
  files: readonly ChangedFile[],
  options: { allowedNames?: readonly string[] } = {},
): { ok: boolean; hits: EnvRead[] } {
  const allowedNames = new Set(options.allowedNames ?? ["FRIDAY_HOME", "NODE_ENV"]);
  const hits: EnvRead[] = [];

  for (const { path, added } of files) {
    if (!path.startsWith("src/pomelo/") && !path.startsWith("src/client/pomelo/")) continue;
    if (TEST_PATH.test(path)) continue;

    const lines = [...added].sort((a, b) => a.line - b.line);
    // Parse adjacent additions together but never join code across unknown source lines.
    for (let start = 0; start < lines.length;) {
      let end = start + 1;
      while (end < lines.length && lines[end].line === lines[end - 1].line + 1) end++;

      const source = lines.slice(start, end).map(({ text }) => text).join("\n");
      let index = start;
      let lineEnd = lines[index].text.length;
      for (const { offset, name, reason } of scan(source, path, allowedNames)) {
        while (offset > lineEnd) lineEnd += lines[++index].text.length + 1;
        hits.push({ path, line: lines[index].line, name, reason });
      }
      start = end;
    }
  }

  return { ok: hits.length === 0, hits };
}

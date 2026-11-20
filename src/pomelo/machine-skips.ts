import { typescriptLanguage } from "@codemirror/lang-javascript";

type AddedLine = { line: number; text: string };
type SyntaxNode = ReturnType<typeof typescriptLanguage.parser.parse>["topNode"];
type MachineSkipKind = "platform" | "ci" | "env" | "arch";
type MachineSkipFinding = { path: string; line: number; kind: MachineSkipKind };
type MachineSkipResult = { ok: boolean; findings: MachineSkipFinding[] };

const pomeloTest = /^test\/pomelo-[^/\r\n]*\.test\.ts$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function propertyName(node: SyntaxNode, source: string): string | undefined {
  const name = node.getChild("PropertyName");
  if (name) return source.slice(name.from, name.to);
  const key = node.getChild("String");
  if (key) return source.slice(key.from + 1, key.to - 1);
}

function machineKind(node: SyntaxNode, source: string): MachineSkipKind | undefined {
  const receiver = node.firstChild;
  if (!receiver) return;
  const name = propertyName(node, source);

  if (receiver.name === "MemberExpression") {
    const envReceiver = receiver.firstChild;
    if (envReceiver?.name === "VariableName" && source.slice(envReceiver.from, envReceiver.to) === "process"
      && propertyName(receiver, source) === "env") {
      return name === "CI" ? "ci" : "env";
    }
  }

  if (receiver.name !== "VariableName" || (name !== "platform" && name !== "arch")) return;
  const variable = source.slice(receiver.from, receiver.to);
  if (variable === "process" || (variable === "os" && node.parent?.name === "CallExpression")) return name;
}

function conditionOf(node: SyntaxNode, source: string): SyntaxNode | null {
  if (node.name === "IfStatement") return node.getChild("ParenthesizedExpression");
  if (node.name === "ConditionalExpression") return node.firstChild;
  if (node.name === "BinaryExpression") {
    const operator = node.getChild("LogicOp");
    const spelling = operator && source.slice(operator.from, operator.to);
    if (spelling === "&&" || spelling === "||") return node.firstChild;
  }
  return null;
}

function scanChunk(path: string, lines: readonly AddedLine[], findings: MachineSkipFinding[]): void {
  if (lines.length === 0) return;
  const source = lines.map(({ text }) => text).join("\n");
  const tree = typescriptLanguage.parser.parse(source);
  let condition: SyntaxNode | null = null;
  let lineIndex = 0;
  let nextLineStart = lines[0].text.length + 1;
  const kindsOnLine = new Set<MachineSkipKind>();

  // The syntax tree keeps comments and literal contents out of the expressions we check.
  tree.iterate({
    enter({ name, from, to, node }) {
      if (!condition || from >= condition.to) condition = conditionOf(node, source);
      if (!condition || name !== "MemberExpression" || from < condition.from || to > condition.to) return;
      const kind = machineKind(node, source);
      if (!kind) return;

      while (lineIndex < lines.length - 1 && from >= nextLineStart) {
        lineIndex++;
        nextLineStart += lines[lineIndex].text.length + 1;
        kindsOnLine.clear();
      }
      if (kindsOnLine.has(kind)) return;
      kindsOnLine.add(kind);
      findings.push({ path, line: lines[lineIndex].line, kind });
    },
  });
}

/** Report machine-dependent conditions in added Pomelo test lines. */
export function findMachineSkips(files: unknown): MachineSkipResult {
  const findings: MachineSkipFinding[] = [];
  if (!Array.isArray(files)) return { ok: true, findings };

  for (const file of files) {
    if (!isRecord(file) || typeof file.path !== "string" || !Array.isArray(file.addedLines)) continue;
    if (!pomeloTest.test(file.path.replaceAll("\\", "/"))) continue;

    let chunk: AddedLine[] = [];
    for (const added of file.addedLines) {
      if (!isRecord(added)) continue;
      const { line, text } = added;
      if (typeof line !== "number" || !Number.isSafeInteger(line) || line < 1 || typeof text !== "string") continue;
      // A gap may contain the end of a comment or string, so parse contiguous additions together.
      const previous = chunk.at(-1);
      if (previous && previous.line + 1 !== line) {
        scanChunk(file.path, chunk, findings);
        chunk = [];
      }
      chunk.push({ line, text });
    }
    scanChunk(file.path, chunk, findings);
  }

  return { ok: findings.length === 0, findings };
}

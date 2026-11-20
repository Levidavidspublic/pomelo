export const CODE_BLOCK_FOLD_LIMIT = 20;

const MAX_INFO_LENGTH = 24;
const LANGUAGES = new Map([
  ["ts", "TypeScript"], ["typescript", "TypeScript"],
  ["js", "JavaScript"], ["javascript", "JavaScript"],
  ["py", "Python"], ["python", "Python"],
  ["sh", "Shell"], ["bash", "Bash"],
  ["json", "JSON"],
  ["yaml", "YAML"], ["yml", "YAML"],
  ["html", "HTML"],
  ["css", "CSS"],
  ["sql", "SQL"],
  ["go", "Go"],
  ["rs", "Rust"], ["rust", "Rust"],
  ["c", "C"],
  ["cpp", "C++"], ["c++", "C++"],
  ["csharp", "C#"], ["cs", "C#"], ["c#", "C#"],
]);

const COPY_LABELS = { reset: "copy", success: "copied", failure: "could not copy" } as const;
export type CopyResult = keyof typeof COPY_LABELS;

export type CodeBlockModel = {
  dir: "ltr";
  languageLabel: string;
  lineCount: number;
  visibleText: string;
  folded: boolean;
  showAllLabel: string | null;
  copy: { enabled: boolean; label: (typeof COPY_LABELS)[CopyResult]; text: string };
};

function languageLabel(info: string): string {
  if (info.length > MAX_INFO_LENGTH || /[^ a-z0-9+#-]/i.test(info)) return "code";
  return LANGUAGES.get(info.trim().toLowerCase()) ?? "code";
}

/** The text is the code body extracted by the Markdown parser, between the fences. */
export function codeBlockModel({ text, info = "" }: { text: string; info?: string }): CodeBlockModel {
  const copyText = text.replace(/\r\n?/g, "\n");
  const lines = copyText.split("\n");
  // A final LF terminates the last line. Keep it in the text for copying.
  if (lines.at(-1) === "") lines.pop();
  const lineCount = lines.length;
  const folded = lineCount > CODE_BLOCK_FOLD_LIMIT;

  return {
    dir: "ltr",
    languageLabel: languageLabel(info),
    lineCount,
    visibleText: folded ? lines.slice(0, CODE_BLOCK_FOLD_LIMIT).join("\n") : copyText,
    folded,
    showAllLabel: folded ? `show all ${lineCount} lines` : null,
    copy: { enabled: copyText !== "", label: COPY_LABELS.reset, text: copyText },
  };
}

export function unfoldCodeBlock(model: CodeBlockModel): CodeBlockModel {
  if (!model.folded) return model;
  return { ...model, visibleText: model.copy.text, folded: false, showAllLabel: null };
}

export function withCopyResult(model: CodeBlockModel, result: CopyResult): CodeBlockModel {
  if (!model.copy.enabled) return model;
  return { ...model, copy: { ...model.copy, label: COPY_LABELS[result] } };
}

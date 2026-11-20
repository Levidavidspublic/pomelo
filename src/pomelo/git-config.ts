import { posix, win32 } from "node:path";

type GitConfigOptions = {
  repoRoot?: string;
  expectedAutoCrlf?: "false" | "true" | "input";
};

type GitConfigProblem = { key: string; origin: string | null; reason: string };
type Setting = { origin: string; value?: string; rewriteKey?: string };

const configRow = /^file:([^\x00-\x1f\x7f]+)\t([^\x00\r]+)$/;
const configKey = /^[a-z][a-z\d-]*\.(?:[^\t]*\.)?[a-z][a-z\d-]*$/i;
const urlRewrite = /^(url\..*?\.(insteadof|pushinsteadof))(?:=[\s\S]*)?$/i;

function gitBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined || /^(?:true|yes|on)$/i.test(value)) return true;
  if (value === "" || /^(?:false|no|off)$/i.test(value)) return false;
  const number = /^([+-]?(?:0x[\da-f]+|0[0-7]*|[1-9]\d*))[kmg]?$/i.exec(value)?.[1];
  return number === undefined ? undefined : Number(number.replace(/^[+-]/, "")) !== 0;
}

function hooksPathIsInside(value: string | undefined, repoRoot: string | undefined): boolean {
  if (!repoRoot || !value || /^(?:~|%\(prefix\)\/)/.test(value)) return false;
  const windows = /^(?:[a-z]:[/\\]|[/\\]{2}[^/\\]+[/\\][^/\\]+)/i.test(repoRoot);
  const path = windows ? win32 : posix;
  if (!path.isAbsolute(repoRoot) || (windows && /^[a-z]:(?![/\\])/i.test(value))) return false;

  const relative = path.relative(repoRoot, path.resolve(repoRoot, value));
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function credentialHelperProblem(value: string | undefined): string | undefined {
  const helper = /^(?:"([^"]+)"|'([^']+)'|(\S+))/.exec(value?.trimStart() ?? "");
  const command = helper?.[1] ?? helper?.[2] ?? helper?.[3] ?? "";
  if (/^store$/i.test(command)) return "Git can save credentials in plaintext.";
  if (/[/\\]/.test(command)) return "Git is configured to run a credential helper from a path.";
}

/** Check file-origin lines from git config --list --show-origin using only the supplied text and policy. */
export function gitConfigCheck(text: string, options: GitConfigOptions = {}): {
  verdict: "go" | "stop";
  problems: GitConfigProblem[];
} {
  const settings = new Map<string, Setting>();
  const problems: GitConfigProblem[] = [];

  if (!text.trim()) {
    return { verdict: "stop", problems: [{ key: "git-config", origin: null, reason: "Git config output is empty." }] };
  }

  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  for (const [index, line] of lines.entries()) {
    const row = configRow.exec(line);
    if (!row?.[1].trim()) {
      problems.push({ key: "git-config", origin: null, reason: `Line ${index + 1} has no readable file origin or setting.` });
      continue;
    }

    const [, origin, entry] = row;
    // A rewrite's URL subsection can contain '=', and can carry sensitive data.
    const rewrite = urlRewrite.exec(entry);
    if (rewrite) {
      settings.set(rewrite[1].toLowerCase(), { origin, rewriteKey: `url.*.${rewrite[2].toLowerCase()}` });
      continue;
    }

    const separator = entry.indexOf("=");
    const key = (separator === -1 ? entry : entry.slice(0, separator)).toLowerCase();
    if (!configKey.test(key)) {
      problems.push({ key: "git-config", origin, reason: `Line ${index + 1} has no readable Git config key.` });
      continue;
    }
    settings.set(key, { origin, value: separator === -1 ? undefined : entry.slice(separator + 1) });
  }

  const hasSigningKey = Boolean(settings.get("user.signingkey")?.value?.trim());
  for (const [key, { origin, value, rewriteKey }] of settings) {
    if (rewriteKey) {
      problems.push({ key: rewriteKey, origin, reason: "Git rewrites remote URLs using this setting." });
      continue;
    }

    let reason: string | undefined;
    switch (key) {
      case "core.hookspath":
        if (!hooksPathIsInside(value, options.repoRoot)) reason = "The hooks path cannot be confirmed inside the repository.";
        break;
      case "credential.helper":
        reason = credentialHelperProblem(value);
        break;
      case "core.autocrlf": {
        const mode = value?.toLowerCase() === "input" ? "input" : gitBoolean(value) === true ? "true" : undefined;
        if (mode && mode !== options.expectedAutoCrlf) reason = "Line-ending conversion differs from the repository policy.";
        break;
      }
      case "commit.gpgsign":
      case "tag.gpgsign":
        if (gitBoolean(value) === true && !hasSigningKey) reason = "Signing is required without a configured signing key.";
        break;
      case "core.fsmonitor":
        if (gitBoolean(value) === undefined) reason = "Git is configured to run a filesystem monitor command.";
        break;
      case "core.sshcommand":
        reason = "Git is configured to use a custom SSH command.";
        break;
      case "push.default":
        if (value?.toLowerCase() === "matching") reason = "The default push can send several branches at once.";
        break;
    }
    if (reason) problems.push({ key, origin, reason });
  }

  for (const key of ["user.name", "user.email"]) {
    const setting = settings.get(key);
    if (!setting?.value?.trim()) {
      problems.push({ key, origin: setting?.origin ?? null, reason: "The Git identity setting is missing or blank." });
    }
  }

  return { verdict: problems.length ? "stop" : "go", problems };
}

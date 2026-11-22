export interface LocaleCheckInput {
  readonly localeText?: unknown;
  readonly tz?: string;
  readonly expectedTz?: string;
}

interface LocaleProblem {
  setting: string;
  reason: string;
}

export interface LocaleCheckResult {
  decision: "go" | "stop";
  problems: LocaleProblem[];
}

const CHARSET_SETTINGS = ["LC_ALL", "LC_CTYPE", "LANG"] as const;

function readLocaleProblem(text: unknown): LocaleProblem | undefined {
  const unreadable = { setting: "locale", reason: "Could not read the locale report." };
  if (typeof text !== "string") return unreadable;

  const settings = new Map<string, string>();
  for (const row of text.split(/\r?\n/)) {
    const line = row.trim();
    if (!line) continue;

    const warning = /^(?:locale:\s*)?Cannot set\b(?:\s+(LC_[A-Z_]+|LANG)\b)?/.exec(line);
    if (warning) {
      const setting = warning[1] ?? "locale";
      return { setting, reason: `Cannot set ${setting} to a working locale.` };
    }

    const assignment = /^(LANG|LANGUAGE|LC_[A-Z_]+)=(.*)$/.exec(line);
    if (!assignment) return unreadable;

    const [, setting, rawValue] = assignment;
    const value = /^(?:"([\w.@:-]*)"|([\w.@:-]*))$/.exec(rawValue);
    if (!value || settings.has(setting)) {
      return { setting, reason: `Could not read ${setting} from the locale report.` };
    }
    settings.set(setting, value[1] ?? value[2]);
  }

  // Empty settings are unset. Only the first nonempty setting controls the character set.
  for (const setting of CHARSET_SETTINGS) {
    const value = settings.get(setting);
    if (!value) continue;
    if (/^[\w-]+\.utf-?8(?:@[\w-]+)?$/i.test(value)) return;
    return { setting, reason: `${setting} must use UTF-8 (found ${value}).` };
  }
  return { setting: "locale", reason: "The locale report has no value for LC_ALL, LC_CTYPE or LANG." };
}

/** Check the supplied locale output and time zone before running host tests. */
export function localeCheck({ localeText, tz, expectedTz = "UTC" }: LocaleCheckInput): LocaleCheckResult {
  const problems: LocaleProblem[] = [];
  const localeProblem = readLocaleProblem(localeText);
  if (localeProblem) problems.push(localeProblem);

  if (typeof tz !== "string" || !tz) {
    problems.push({ setting: "TZ", reason: "TZ is not set." });
  } else if (tz !== expectedTz) {
    problems.push({ setting: "TZ", reason: `TZ is ${JSON.stringify(tz)}, which differs from the expected time zone.` });
  }

  return { decision: problems.length ? "stop" : "go", problems };
}

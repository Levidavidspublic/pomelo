import { posix } from "node:path";

export interface LaunchPlanInput {
  profileDir: string;
  location: "pc" | "vps";
  headless: boolean;
  debuggingPort: number;
  extraFlags?: readonly string[];
  companionExtensionPath?: string;
}

export interface LaunchFlagRefusal {
  flag: string;
  reason: string;
}

export type LaunchPlan =
  | { ok: true; args: string[]; env: Record<string, string> }
  | { ok: false; refused: LaunchFlagRefusal[] };

// Some allowed names have restrictions on their values or where they can be used.
export const LAUNCH_FLAG_ALLOW_LIST: readonly string[] = Object.freeze([
  "--no-first-run",
  "--no-default-browser-check",
  "--remote-debugging-address",
  "--no-sandbox",
  "--load-extension",
  "--disable-extensions-except",
]);

export const LAUNCH_FLAG_DENY_LIST = Object.freeze({
  "--disable-web-security": "Chromium web security must stay enabled.",
  "--ignore-certificate-errors": "Chromium must validate HTTPS certificates.",
  "--allow-running-insecure-content": "Chromium must block insecure active content on secure pages.",
  "--remote-debugging-address": "The debugging address must be loopback.",
  "--remote-allow-origins": "Custom debugging origins can let other sites access the debugger.",
  "--no-sandbox": "Disabling the Chromium sandbox is only allowed on the VPS with a bare --no-sandbox flag.",
  "--load-extension": "Chromium may load only the configured Pomelo companion extension.",
  "--disable-extensions-except": "Only the configured Pomelo companion extension may be exempted.",
  "--user-data-dir": "The profile directory is already set by the launch plan.",
  "--enable-logging": "Chromium diagnostic logs can write sensitive data to disk.",
  "--log-net-log": "Chromium network logs can write sensitive request data to disk.",
});

const LOOPBACK = "127.0.0.1";

function absolutePath(value: unknown): value is string {
  return typeof value === "string" && posix.isAbsolute(value) &&
    value === value.trim() && !/[\x00-\x1f\x7f]/.test(value);
}

function extraFlagRefusal(
  flag: string,
  value: string | undefined,
  location: unknown,
  companionExtensionPath: unknown,
): string | undefined {
  switch (flag) {
    case "--remote-debugging-address":
      // Match the loopback hosts in cdp-target.ts. The plan emits a literal IPv4 address.
      if (value === LOOPBACK || value === "localhost" || value === "::1" || value === "[::1]") return;
      break;
    case "--no-sandbox":
      if (location === "vps" && value === undefined) return;
      break;
    case "--load-extension":
    case "--disable-extensions-except":
      // Chromium treats the value as a comma-separated list of extension paths.
      if (absolutePath(value) && !value.includes(",") && value === companionExtensionPath) return;
      break;
    default:
      if (LAUNCH_FLAG_ALLOW_LIST.includes(flag)) {
        return value === undefined ? undefined : "This launch flag takes no value.";
      }
  }

  if (Object.hasOwn(LAUNCH_FLAG_DENY_LIST, flag)) {
    return LAUNCH_FLAG_DENY_LIST[flag as keyof typeof LAUNCH_FLAG_DENY_LIST];
  }
  return "Unknown Chromium launch flag.";
}

/** Validate launch settings at runtime so callers can pass untrusted data. */
export function buildLaunchPlan(input: unknown): LaunchPlan {
  try {
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
      return { ok: false, refused: [{ flag: "input", reason: "Expected a launch settings object." }] };
    }
    const { profileDir, location, headless, debuggingPort, extraFlags, companionExtensionPath } =
      input as Partial<Record<keyof LaunchPlanInput, unknown>>;
    const args: string[] = [];
    const refused: LaunchFlagRefusal[] = [];

    if (absolutePath(profileDir)) {
      args.push(`--user-data-dir=${profileDir}`);
    } else {
      refused.push({ flag: "--user-data-dir", reason: "The profile directory must be an absolute path." });
    }
    args.push(`--remote-debugging-address=${LOOPBACK}`);
    if (typeof debuggingPort === "number" && Number.isInteger(debuggingPort) &&
        debuggingPort >= 1024 && debuggingPort <= 65535) {
      args.push(`--remote-debugging-port=${debuggingPort}`);
    } else {
      refused.push({ flag: "--remote-debugging-port", reason: "The debugging port must be an integer from 1024 through 65535." });
    }
    if (location !== "pc" && location !== "vps") {
      refused.push({ flag: "location", reason: 'The profile location must be "pc" or "vps".' });
    }

    // Chromium's automation mode suppresses the password-saving UI.
    args.push("--enable-automation", "--disable-sync");
    if (typeof headless !== "boolean") {
      refused.push({ flag: "--headless", reason: "The headless setting must be a boolean." });
    } else if (headless) {
      args.push("--headless");
    }

    if (Array.isArray(extraFlags)) {
      for (const extra of extraFlags as readonly unknown[]) {
        if (typeof extra !== "string") {
          refused.push({ flag: "extraFlags", reason: "Extra launch flags must be strings." });
          continue;
        }
        const equals = extra.indexOf("=");
        const flag = equals === -1 ? extra : extra.slice(0, equals);
        if (!/^--[a-z0-9][a-z0-9-]*$/.test(flag)) {
          refused.push({ flag: "extraFlags", reason: "Expected a Chromium flag in --name or --name=value form." });
          continue;
        }
        const value = equals === -1 ? undefined : extra.slice(equals + 1);
        const reason = extraFlagRefusal(flag, value, location, companionExtensionPath);
        if (reason !== undefined) {
          refused.push({ flag, reason });
        } else if (flag !== "--remote-debugging-address" && !args.includes(extra)) {
          args.push(extra);
        }
      }
    } else if (extraFlags !== undefined) {
      refused.push({ flag: "extraFlags", reason: "Extra launch flags must be an array." });
    }

    return refused.length > 0 ? { ok: false, refused } : { ok: true, args, env: {} };
  } catch {
    return { ok: false, refused: [{ flag: "input", reason: "Launch settings could not be read." }] };
  }
}

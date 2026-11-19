import { ENGINE_NAMES } from "../../types.js";
import type { LocalTool } from "../local.js";

type ToolRow = Pick<LocalTool, "tool" | "name" | "path" | "loggedIn">;

const driverOrder = ["claude", "codex", "opencode"] as const;
const settingsAction = Object.freeze({ kind: "settings" as const });

export function driverBanner(tools: readonly ToolRow[]) {
  const installed = tools.filter((tool) => tool.path);
  // Match Setup: a CLI that cannot report its sign-in status may still be usable.
  if (installed.some((tool) => tool.loggedIn !== false)) return null;

  const names = driverOrder
    .filter((driver) => installed.some((tool) => tool.tool === driver))
    .map((driver) => ENGINE_NAMES[driver]);

  return Object.freeze({
    text: installed.length
      ? "Sign in to Claude Code / Codex on this machine"
      : "Install Claude Code, Codex, or OpenCode on this machine",
    tools: Object.freeze(names),
    action: settingsAction,
  });
}

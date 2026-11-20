import type { SpawnDecision } from "./spawn-limit.js";
import type { TagLimitDecision } from "./tag-limit.js";
import type { TagNameRefusalReason } from "./tag-name.js";

export type MeshReplyStatus = "opened" | "reused" | "spawned" | "tagged" | "refused" | "failed";

export type MeshReplyReason =
  | "not_main_agent"
  | "too_many_open_children"
  | "too_many_per_window"
  | Extract<SpawnDecision, { ok: false }>["reason"]
  | Extract<TagLimitDecision, { decision: "refuse" }>["reason"]
  | TagNameRefusalReason;

// Friday session routes use this base64url alphabet and length range, which also fits lane IDs.
const safeId = /^[\w-]{4,40}$/;

const replyText: Record<Exclude<MeshReplyStatus, "reused">, string> = {
  opened: "Opened a new thread.",
  spawned: "Spawned a sub-agent.",
  tagged: "Tagged this thread.",
  refused: "Ask Amit how to proceed.",
  failed: "The mesh tool failed.",
};

const reusedText = {
  open_thread: "Reused the earlier thread, so there is no need to retry.",
  spawn_subagent: "Reused the earlier lane, so there is no need to retry.",
  tag_project: "Reused the existing project tag, so there is no need to retry.",
};

const refusalText: Record<MeshReplyReason, string> = {
  not_main_agent: "Ask the main agent to open the thread.",
  too_many_open_children: "Wait for a child thread to close before opening another.",
  too_many_per_window: "Wait before opening another thread.",
  too_many_running: "Wait for a sub-agent to finish before spawning another.",
  too_deep: "Ask the main agent to spawn the sub-agent.",
  bad_input: "Check the tool inputs before trying again.",
  too_many_tags: "Ask Amit which project tag to replace.",
  too_many_per_run: "Use an existing project tag or wait until the next run.",
  too_many_per_hour: "Wait for the hourly project limit to reset.",
  empty: "Enter a nonempty project name.",
  "not-text": "Provide the project name as text.",
  "looks-secret": "Choose a project name that contains no credentials.",
};

export function meshReply({ tool, status, id, reason }: {
  tool: string;
  status: MeshReplyStatus;
  id?: string;
  reason?: MeshReplyReason;
  detail?: unknown;
}): { ok: boolean; status: MeshReplyStatus; id?: string; text: string } {
  if (typeof tool !== "string" || !Object.hasOwn(reusedText, tool)
    || (status !== "reused" && (typeof status !== "string" || !Object.hasOwn(replyText, status)))
    || (reason !== undefined && (typeof reason !== "string" || !Object.hasOwn(refusalText, reason)))
    || (id !== undefined && (typeof id !== "string" || !safeId.test(id)))) {
    return { ok: false, status: "failed", text: replyText.failed };
  }

  const text = status === "reused" ? reusedText[tool as keyof typeof reusedText]
    : status === "refused" && reason !== undefined ? refusalText[reason]
    : replyText[status];
  return { ok: status !== "refused" && status !== "failed", status, ...(id === undefined ? {} : { id }), text };
}

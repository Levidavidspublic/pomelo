import type { MeshToolDef } from "../agent-mesh.js";

const TITLE_LIMIT = 120;
const PURPOSE_LIMIT = 120;
const PROMPT_LIMIT = 5000;
const TOOL_LIMIT = 32;
const TAG_LIMIT = 32;
const TAG_COUNT_LIMIT = 8;

function textSchema(maxLength: number, description: string) {
  return { type: "string", minLength: 1, maxLength, description };
}

const tagsSchema = {
  type: "array",
  minItems: 1,
  maxItems: TAG_COUNT_LIMIT,
  items: textSchema(TAG_LIMIT, "A project tag."),
};

export const POMELO_MESH_TOOLS: MeshToolDef[] = [
  {
    name: "open_thread",
    description: "Open a new thread when a task needs its own conversation.",
    inputSchema: {
      type: "object",
      properties: {
        title: textSchema(TITLE_LIMIT, "The title shown in the thread list."),
        prompt: textSchema(PROMPT_LIMIT, "The first instruction for the new thread."),
        tags: tagsSchema,
      },
      required: ["title", "prompt"],
      additionalProperties: false,
    },
  },
  {
    name: "spawn_subagent",
    description: "Delegate a self-contained task to a sub-agent that reports back to this thread.",
    inputSchema: {
      type: "object",
      properties: {
        purpose: textSchema(PURPOSE_LIMIT, "A short summary of the sub-agent's task."),
        prompt: textSchema(PROMPT_LIMIT, "Instructions and context for the sub-agent."),
        tool: textSchema(TOOL_LIMIT, "The agent tool to use, if one is needed."),
      },
      required: ["purpose", "prompt"],
      additionalProperties: false,
    },
  },
  {
    name: "tag_project",
    description: "Tag this thread so related work appears together in the project rail.",
    inputSchema: {
      type: "object",
      properties: { tags: tagsSchema },
      required: ["tags"],
      additionalProperties: false,
    },
  },
];

function readText(value: unknown, field: string, limit: number): { text: string } | string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return `Enter nonempty text for ${field}.`;
  if ([...text].length > limit) return `Keep ${field} to ${limit} characters or fewer.`;
  return { text };
}

function readTags(value: unknown): string[] | string {
  if (!Array.isArray(value) || value.length === 0 || value.length > TAG_COUNT_LIMIT) {
    return `Provide tags as a list of 1 to ${TAG_COUNT_LIMIT} entries.`;
  }
  const tags: string[] = [];
  for (const entry of value) {
    const tag = readText(entry, "each entry in tags", TAG_LIMIT);
    if (typeof tag === "string") return tag;
    tags.push(tag.text);
  }
  return tags;
}

export function openThreadAsk(args: Record<string, unknown>): { title: string; prompt: string; tags: string[] } | string {
  const title = readText(args.title, "title", TITLE_LIMIT);
  if (typeof title === "string") return title;
  const prompt = readText(args.prompt, "prompt", PROMPT_LIMIT);
  if (typeof prompt === "string") return prompt;
  const tags = args.tags === undefined ? [] : readTags(args.tags);
  if (typeof tags === "string") return tags;
  return { title: title.text, prompt: prompt.text, tags };
}

export function spawnSubagentAsk(args: Record<string, unknown>): { purpose: string; prompt: string; tool?: string } | string {
  const purpose = readText(args.purpose, "purpose", PURPOSE_LIMIT);
  if (typeof purpose === "string") return purpose;
  const prompt = readText(args.prompt, "prompt", PROMPT_LIMIT);
  if (typeof prompt === "string") return prompt;
  const request = { purpose: purpose.text, prompt: prompt.text };
  if (args.tool === undefined) return request;
  const tool = readText(args.tool, "tool", TOOL_LIMIT);
  if (typeof tool === "string") return tool;
  return { ...request, tool: tool.text };
}

export function tagProjectAsk(args: Record<string, unknown>): { tags: string[] } | string {
  const tags = readTags(args.tags);
  if (typeof tags === "string") return tags;
  return { tags };
}

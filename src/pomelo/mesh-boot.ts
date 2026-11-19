import { randomBytes } from "node:crypto";
import type { AgentMesh } from "../agent-mesh.js";
import { laneName, type SessionCore } from "../session/core.js";
import { driverOf, type SessionState } from "../session/projection.js";
import type { SessionStore } from "../session/store.js";
import { ENGINE_TOOLS, MAIN_LANE, type Member } from "../types.js";
import { createLane } from "./lanes.js";
import { pomeloMeshCall, type PomeloMeshDeps } from "./mesh-handlers.js";
import { POMELO_MESH_TOOLS } from "./mesh-tools.js";
import type { PomeloStore } from "./store.js";
import { addProjectTags, getThreadMeta, saveThreadMeta } from "./thread-meta.js";
import { newThreadFields } from "./thread-open.js";

export function pomeloMeshHook(deps: PomeloMeshDeps): NonNullable<AgentMesh["pomelo"]> {
  return {
    tools: POMELO_MESH_TOOLS,
    call: (sid, lane, name, args) => pomeloMeshCall(deps, sid, lane, name, args),
  };
}

interface FridayMeshDeps {
  sessions: Pick<SessionStore, "create" | "state">;
  handle: SessionCore["handle"];
  store: PomeloStore;
}

function caller(state: SessionState, lane: string): Omit<Member, "role"> {
  if (lane !== MAIN_LANE && !state.lanes.some(({ id }) => id === lane)) throw new Error("Unknown calling lane.");
  const id = state.engines[lane]?.hostId || driverOf(state, lane)?.id || state.ownerId;
  const member = state.members[id];
  if (!member || member.removed || !member.role) throw new Error("The calling agent has no session member.");
  return { id, name: member.name };
}

export function fridayMeshDeps({ sessions, handle, store }: FridayMeshDeps): PomeloMeshDeps {
  const now = Date.now;
  const command = async (...args: Parameters<SessionCore["handle"]>) => {
    const result = await handle(...args);
    if (!result.ok) throw new Error(result.error);
    return result;
  };

  return {
    store,
    now,
    addProjectTags: (sid, slugs) => addProjectTags(store, sid, slugs, now()),
    async createThread({ title, prompt, projectTags, openedBy, parentThreadId, lastActivityAt }) {
      const parent = await sessions.state(parentThreadId);
      const owner: Member = { ...caller(parent, openedBy), role: "owner" };
      const parentMeta = await getThreadMeta(store, parentThreadId);
      const fields = newThreadFields({
        parent: { id: parentThreadId, projectTags: parentMeta?.projectTags },
        tags: projectTags.length ? projectTags : undefined,
        openedBy,
        now: lastActivityAt,
      });
      if ("error" in fields) throw new Error(fields.error);

      const id = randomBytes(6).toString("base64url");
      const via = laneName(parent, openedBy);
      const model = owner.id === parent.ownerId ? parent.options.model : "";
      await sessions.create(id, title, owner, { controlMode: "ask", mcp: true, model }, parent.workspaceId);
      await saveThreadMeta(store, { sid: id, ...fields });
      const tool = parent.engines[openedBy]?.tool;
      if (tool) await command(id, owner, { type: "engine.expect", tool });
      await command(id, { ...owner, via }, { type: "instruct", text: prompt });
      return { id, title };
    },
    async addLane(sid, { purpose, prompt, tool, spawnedBy }) {
      const state = await sessions.state(sid);
      const actor = caller(state, spawnedBy);
      const engine = tool === undefined ? state.engines[spawnedBy]?.tool : ENGINE_TOOLS.find((name) => name === tool);
      if (tool !== undefined && !engine) throw new Error("Unknown coding agent.");

      const added = await command(sid, actor, { type: "lane.add", name: purpose, engine: !!engine });
      if (!added.lane) throw new Error("Could not add the sub-agent lane.");
      const lane = added.lane;
      const updated = await sessions.state(sid);
      await createLane(store, { threadId: sid, laneId: lane, spawnedBy, purpose, createdAt: now() });
      if (engine) await command(sid, actor, { type: "engine.expect", lane, tool: engine });
      await command(sid, { ...actor, via: laneName(state, spawnedBy) }, {
        type: "instruct", lane, text: prompt, handoff: { fromLane: spawnedBy, reason: purpose, carried: [] },
      });
      return { name: laneName(updated, lane) };
    },
  };
}

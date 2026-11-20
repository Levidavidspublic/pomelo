const HOUR_MS = 60 * 60_000;

export interface TagLimits {
  maxTagsPerThread: number;
  maxNewProjectsPerRun: number;
  maxNewProjectsPerHour: number;
}

const DEFAULT_TAG_LIMITS: Readonly<TagLimits> = {
  maxTagsPerThread: 5,
  maxNewProjectsPerRun: 3,
  maxNewProjectsPerHour: 10,
};

export interface TagLimitInput {
  threadTags: readonly string[];
  /** A tag identifier in the same form as the thread's stored tags. */
  tag: string;
  projectExists: boolean;
  newProjectsThisRun: number;
  /** Creation times in milliseconds for the hourly budget, including across runs. */
  newProjectTimes: readonly number[];
  now: number;
}

export type TagLimitDecision =
  | { decision: "allow" | "already"; reason?: never; message?: never }
  | {
    decision: "refuse";
    reason: "too_many_tags" | "too_many_per_run" | "too_many_per_hour" | "bad_input";
    message: string;
  };

function badInput(message: string): TagLimitDecision {
  return { decision: "refuse", reason: "bad_input", message };
}

function isCount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function isTag(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Check an agent's proposed tag against a caller-supplied snapshot before writing. */
export function checkTagLimit(input: TagLimitInput, limits: TagLimits = DEFAULT_TAG_LIMITS): TagLimitDecision {
  if (!input || !Array.isArray(input.threadTags) || !isTag(input.tag) || typeof input.projectExists !== "boolean") {
    return badInput("The thread's tags, the proposed tag, and whether its project exists are required.");
  }

  const { threadTags, tag, projectExists, newProjectsThisRun, newProjectTimes, now } = input;
  if (!Number.isFinite(now) || !isCount(newProjectsThisRun) || !Array.isArray(newProjectTimes)) {
    return badInput("A finite current time, a whole number of new projects, and their creation history are required.");
  }
  if (!limits || ![limits.maxTagsPerThread, limits.maxNewProjectsPerRun, limits.maxNewProjectsPerHour].every(isCount)) {
    return badInput("Tag limits must be non-negative whole numbers.");
  }

  for (const currentTag of threadTags) {
    if (!isTag(currentTag)) return badInput("Each thread tag must be non-empty text.");
  }

  let newProjectsThisHour = 0;
  for (const createdAt of newProjectTimes) {
    if (!Number.isFinite(createdAt) || createdAt > now) {
      return badInput("Project creation times must be finite and at or before the current time.");
    }
    if (now - createdAt <= HOUR_MS) newProjectsThisHour++;
  }

  if (threadTags.includes(tag)) return { decision: "already" };

  const { maxTagsPerThread, maxNewProjectsPerRun, maxNewProjectsPerHour } = limits;
  if (threadTags.length >= maxTagsPerThread) {
    return {
      decision: "refuse",
      reason: "too_many_tags",
      message: `This thread has reached the limit of ${maxTagsPerThread} project ${maxTagsPerThread === 1 ? "tag" : "tags"}.`,
    };
  }
  if (projectExists) return { decision: "allow" };

  if (newProjectsThisRun >= maxNewProjectsPerRun) {
    return {
      decision: "refuse",
      reason: "too_many_per_run",
      message: `You have reached the limit of ${maxNewProjectsPerRun} new ${maxNewProjectsPerRun === 1 ? "project" : "projects"} in this run.`,
    };
  }
  if (newProjectsThisHour >= maxNewProjectsPerHour) {
    return {
      decision: "refuse",
      reason: "too_many_per_hour",
      message: `You have reached the limit of ${maxNewProjectsPerHour} new ${maxNewProjectsPerHour === 1 ? "project" : "projects"} in the last hour.`,
    };
  }
  return { decision: "allow" };
}

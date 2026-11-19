import { hideSecrets } from "../secrets.js";
import type { SkillInput } from "../skills.js";

export const BROWSER_SKILL_LIMITS = { steps: 50, stepChars: 300, nameChars: 60 } as const;

const vaultPath = /op:\/\//i;

function parseStartOrigin(input: string): URL | undefined {
  // Check the spelling before URL parsing, which can normalize away paths and empty userinfo.
  if (!/^https?:\/\/[^/?#\\@\s]+$/i.test(input)) return;
  if (/^http:/i.test(input) && !/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(input)) return;

  try {
    const url = new URL(input);
    if (!hideSecrets(input).hidden && !hideSecrets(url.origin).hidden) return url;
  } catch {
    return;
  }
}

/** Builds the skill payload from steps that have already been masked by the browser. */
export function browserSkillInput(job: {
  name: string;
  state: string;
  startOrigin: string;
  steps: readonly string[];
  refIds?: readonly string[];
}): { skill: SkillInput } | { error: string } {
  if (job.state !== "done") return { error: "Only a finished browser job can become a skill." };

  const name = job.name.trim();
  if (!name) return { error: "Give the browser skill a name." };
  if (!job.steps.length || job.steps.length > BROWSER_SKILL_LIMITS.steps) {
    return { error: `A browser skill needs 1 to ${BROWSER_SKILL_LIMITS.steps} steps.` };
  }

  const start = parseStartOrigin(job.startOrigin);
  if (!start) return { error: "Give the browser skill a valid start origin." };
  if (vaultPath.test(name) || job.steps.some((step) => vaultPath.test(step))) {
    return { error: "Use saved secret reference IDs for browser skills." };
  }

  const refIds = job.refIds ?? [];
  if (refIds.some((id) => !id || /[^a-z0-9_-]/i.test(id) || hideSecrets(id).hidden)) {
    return { error: "The browser skill has an invalid secret reference ID." };
  }

  const instructions = [
    `Start at ${start.origin}.`,
    ...job.steps.map((step, index) => {
      const line = hideSecrets(step).text.replace(/[\r\n\u2028\u2029]+/g, " ");
      return `${index + 1}. ${line.slice(0, BROWSER_SKILL_LIMITS.stepChars)}`;
    }),
  ];
  if (refIds.length) {
    instructions.push(`Fills use saved secret references: ${refIds.join(", ")}. Ask the broker to fill; never type a value.`);
  }

  return {
    skill: {
      name: hideSecrets(name).text.slice(0, BROWSER_SKILL_LIMITS.nameChars),
      description: `Browser skill saved from a finished job on ${start.host}.`,
      instructions: instructions.join("\n"),
      keywords: ["browser", start.host],
    },
  };
}

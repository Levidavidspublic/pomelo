import assert from "node:assert/strict";
import test from "node:test";
import { BROWSER_SKILL_LIMITS, browserSkillInput } from "../src/pomelo/browser-skill.js";
import { HIDDEN } from "../src/secrets.js";

const job = {
  name: "  Check dashboard  ",
  state: "done",
  startOrigin: "https://example.invalid",
  steps: ["Open the sign-in form.", "Fill the field marked ••••.", "Open the dashboard."],
} as const;

test("a finished job gives Friday a skill with numbered steps and reference IDs", () => {
  assert.deepEqual(browserSkillInput({ ...job, refIds: ["login_1", "second-factor"] }), {
    skill: {
      name: "Check dashboard",
      description: "Browser skill saved from a finished job on example.invalid.",
      instructions: [
        "Start at https://example.invalid.",
        "1. Open the sign-in form.",
        "2. Fill the field marked ••••.",
        "3. Open the dashboard.",
        "Fills use saved secret references: login_1, second-factor. Ask the broker to fill; never type a value.",
      ].join("\n"),
      keywords: ["browser", "example.invalid"],
    },
  });
});

test("jobs must be done, named and have at least one step", () => {
  for (const state of ["running", "failed"]) {
    assert.ok("error" in browserSkillInput({ ...job, state }));
  }
  assert.ok("error" in browserSkillInput({ ...job, name: " \n " }));
  assert.ok("error" in browserSkillInput({ ...job, steps: [] }));
});

test("the start must be a bare HTTPS origin or an allowed HTTP loopback origin", () => {
  for (const startOrigin of [
    "https://example.invalid/path",
    "https://example.invalid/.",
    "https://example.invalid?",
    "https://example.invalid#",
    "https://user:pass@example.invalid",
    "https://@example.invalid",
    "http://example.invalid",
    "http://127.0.0.2",
    "http://127.1",
  ]) {
    assert.ok("error" in browserSkillInput({ ...job, startOrigin }), startOrigin);
  }

  for (const startOrigin of ["https://example.invalid:8443", "http://localhost:8080", "http://127.0.0.1"]) {
    const result = browserSkillInput({ ...job, startOrigin, refIds: [] });
    assert.ok("skill" in result);
    assert.equal(result.skill.instructions, [
      `Start at ${startOrigin}.`,
      "1. Open the sign-in form.",
      "2. Fill the field marked ••••.",
      "3. Open the dashboard.",
    ].join("\n"));
  }
});

test("the name and steps cannot contain vault paths, and reference IDs use only safe characters", () => {
  assert.ok("error" in browserSkillInput({ ...job, name: "Use op://" }));
  assert.ok("error" in browserSkillInput({ ...job, steps: ["Use op://"] }));
  assert.ok("error" in browserSkillInput({ ...job, steps: [`${"x".repeat(300)} OP://`] }));
  for (const refId of ["", "vault/item", "login.id", "login\n", "login, other"]) {
    assert.ok("error" in browserSkillInput({ ...job, refIds: [refId] }));
  }
});

test("Friday masks a synthetic canary in the name and steps", () => {
  const canary = ["sk", "-", "z9".repeat(20)].join("");
  const result = browserSkillInput({
    ...job,
    name: `Open ${canary}`,
    steps: [`Canary ${canary}`],
  });
  assert.ok("skill" in result);
  assert.ok(result.skill.name?.includes(HIDDEN));
  assert.ok(result.skill.instructions?.includes(HIDDEN));
  assert.equal(JSON.stringify(result).includes(canary), false);

  assert.ok("error" in browserSkillInput({ ...job, refIds: [canary] }));
  assert.ok("error" in browserSkillInput({ ...job, startOrigin: `https://${canary}.invalid` }));
});

test("the builder bounds names and steps and removes line breaks from steps", () => {
  assert.deepEqual(BROWSER_SKILL_LIMITS, { steps: 50, stepChars: 300, nameChars: 60 });
  const result = browserSkillInput({
    ...job,
    name: "n".repeat(61),
    steps: [`Open\r\nthe page\u2028${"x".repeat(300)}`, "Continue."],
  });
  assert.ok("skill" in result);
  assert.equal(result.skill.name, "n".repeat(60));
  assert.equal(result.skill.instructions, [
    "Start at https://example.invalid.",
    `1. Open the page ${"x".repeat(286)}`,
    "2. Continue.",
  ].join("\n"));
});

test("the builder refuses a 51st step", () => {
  const steps = Array<string>(50).fill("Read the page.");
  assert.ok("skill" in browserSkillInput({ ...job, steps }));
  assert.ok("error" in browserSkillInput({ ...job, steps: [...steps, "One more step."] }));
});

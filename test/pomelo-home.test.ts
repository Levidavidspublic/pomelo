import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { applyPomeloDefaults, pomeloHome, pomeloPort } from "../src/pomelo/home.js";

const homedir = path.resolve("example-home");
const defaultHome = path.join(homedir, ".pomelo");

test("defaults to .pomelo and port 4322 when unset", () => {
  const env: NodeJS.ProcessEnv = {};
  assert.equal(pomeloHome(env, homedir), defaultHome);
  assert.equal(pomeloPort(env), "4322");
  assert.deepEqual(env, {});

  applyPomeloDefaults(env, homedir);
  assert.deepEqual(env, { FRIDAY_HOME: defaultHome, PORT: "4322" });
});

test("preserves explicitly set home and port values", () => {
  for (const env of [
    { FRIDAY_HOME: "custom-home", PORT: "0" },
    { FRIDAY_HOME: "", PORT: "" },
  ]) {
    assert.equal(pomeloHome(env, homedir), env.FRIDAY_HOME);
    assert.equal(pomeloPort(env), env.PORT);
    applyPomeloDefaults(Object.freeze(env), homedir);
  }
});

test("defaults each variable independently", () => {
  const customHome = { FRIDAY_HOME: "custom-home" };
  applyPomeloDefaults(customHome, homedir);
  assert.deepEqual(customHome, { FRIDAY_HOME: "custom-home", PORT: "4322" });

  const customPort = { PORT: "8080" };
  applyPomeloDefaults(customPort, homedir);
  assert.deepEqual(customPort, { FRIDAY_HOME: defaultHome, PORT: "8080" });
});

test("applying defaults twice leaves the first values intact", () => {
  const env: NodeJS.ProcessEnv = {};
  applyPomeloDefaults(env, homedir);
  applyPomeloDefaults(Object.freeze(env), path.resolve("another-home"));
  assert.deepEqual(env, { FRIDAY_HOME: defaultHome, PORT: "4322" });
});

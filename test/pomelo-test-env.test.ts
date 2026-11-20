import assert from "node:assert/strict";
import test from "node:test";
import { checkTestEnv } from "../src/pomelo/test-env.js";

const home = "HOME=/home/sample";
const scratch = `${home}\nFRIDAY_HOME=/tmp/friday-test`;

test("checkTestEnv accepts scratch folders and an optional state directory", () => {
  const go = { verdict: "go", problems: [] };
  assert.deepEqual(checkTestEnv(scratch), go);
  assert.deepEqual(checkTestEnv(`${scratch}\r\nFRIDAY_STATE_DIR=/tmp/state with spaces=1/\r\n`), go);
  assert.deepEqual(checkTestEnv(`${home}\nFRIDAY_HOME=/home/sample/.friday-scratch`), go);
  assert.deepEqual(checkTestEnv(String.raw`USERPROFILE=C:\Users\Sample
FRIDAY_HOME=C:\Friday Test\scratch`), go);
});

test("checkTestEnv names FRIDAY_HOME when it is missing or unsafe", () => {
  expectStop(home, ["FRIDAY_HOME"]);
  for (const path of [
    "", " ", "relative/scratch", "C:scratch", "C:/scratch", "/home/sample", "/home/sample/",
    "/home/sample/.friday", "/home/sample/.friday/sub", "/home/sample/.friday/",
    String.raw`/home\sample\.friday\sub`, "//home/sample//.friday", "/tmp/../home/sample/.friday",
  ]) {
    expectStop(`${home}\nFRIDAY_HOME=${path}`, ["FRIDAY_HOME"]);
  }
});

test("checkTestEnv checks Windows homes using USERPROFILE as well as HOME", () => {
  const windowsHome = String.raw`USERPROFILE=C:\Users\Sample`;
  for (const path of [
    String.raw`c:\users\sample`, String.raw`C:\Users\Sample\.friday\sub`,
    "c:/users/sample/.FRIDAY/", "/Users/Sample/.friday",
  ]) {
    expectStop(`${windowsHome}\nFRIDAY_HOME=${path}`, ["FRIDAY_HOME"]);
  }
  expectStop(`${home}\n${windowsHome}\nFRIDAY_HOME=C:/Users/Sample/.friday`, ["FRIDAY_HOME"]);
  expectStop(String.raw`USERPROFILE=//server/share/Sample
FRIDAY_HOME=\\server\share\Sample\.friday`, ["FRIDAY_HOME"]);
});

test("checkTestEnv checks a set FRIDAY_STATE_DIR independently of FRIDAY_HOME", () => {
  for (const path of ["", "relative", "/home/sample", "/home/sample/.friday", "/home/sample/.friday/sub/"]) {
    expectStop(`${scratch}\nFRIDAY_STATE_DIR=${path}`, ["FRIDAY_STATE_DIR"]);
  }
  expectStop(`${home}\nFRIDAY_STATE_DIR=relative`, ["FRIDAY_HOME", "FRIDAY_STATE_DIR"]);
});

test("checkTestEnv stops on empty, broken, or ambiguous env text", () => {
  for (const text of ["", "\r\n", "env: command failed", `${scratch}\nFRIDAY_STATE_DIR /tmp/state`]) {
    assert.equal(checkTestEnv(text).verdict, "stop");
  }
  expectStop("FRIDAY_HOME=/tmp/friday-test", ["FRIDAY_HOME"]);
  expectStop(`${home}\nFRIDAY_HOME=/home/sample/.friday\nFRIDAY_HOME=/tmp/friday-test`, ["FRIDAY_HOME"]);
});

test("checkTestEnv keeps unrelated variable names and values out of the reply", () => {
  const unrelated = "API_TOKEN=example-value=only-for-this-test";
  const unsafe = `${home}\nFRIDAY_HOME=/home/sample/.friday`;
  for (const text of [scratch, unsafe, `${scratch}\nmalformed line`]) {
    assert.deepEqual(checkTestEnv(`${text}\n${unrelated}`), checkTestEnv(text));
  }
});

function expectStop(text: string, names: string[]) {
  const result = checkTestEnv(text);
  assert.equal(result.verdict, "stop");
  assert.deepEqual(result.problems.map(({ name }) => name), names);
  for (const { name, reason } of result.problems) assert.ok(reason.includes(name));
}

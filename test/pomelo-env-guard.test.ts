import assert from "node:assert/strict";
import test from "node:test";
import { findEnvReads } from "../src/pomelo/env-guard.js";

const serverPath = "src/pomelo/settings.ts";
const clientPath = "src/client/pomelo/settings.tsx";

test("reports dot and bracket reads with their added line numbers and names", () => {
  assert.deepEqual(findEnvReads([{
    path: serverPath,
    added: [
      { line: 3, text: 'const one = process.env.SAMPLE_SETTING ?? "fallback";' },
      { line: 9, text: "const two = process.env['EXTRA_SETTING']; const three = process.env?.THIRD_SETTING;" },
    ],
  }]), {
    ok: false,
    hits: [
      { path: serverPath, line: 3, name: "SAMPLE_SETTING", reason: "not-allowed" },
      { path: serverPath, line: 9, name: "EXTRA_SETTING", reason: "not-allowed" },
      { path: serverPath, line: 9, name: "THIRD_SETTING", reason: "not-allowed" },
    ],
  });
});

test("reports destructured source names, including aliased and multiline bindings", () => {
  assert.deepEqual(findEnvReads([{
    path: serverPath,
    added: [
      { line: 11, text: "const {" },
      { line: 12, text: "  SAMPLE_SETTING," },
      { line: 13, text: '  "EXTRA_SETTING": localName = "fallback",' },
      { line: 14, text: "  NODE_ENV: mode," },
      { line: 15, text: "} = process.env;" },
      { line: 20, text: "({ ASSIGNED_SETTING: target } = process.env);" },
    ],
  }]).hits, [
    { path: serverPath, line: 12, name: "SAMPLE_SETTING", reason: "not-allowed" },
    { path: serverPath, line: 13, name: "EXTRA_SETTING", reason: "not-allowed" },
    { path: serverPath, line: 20, name: "ASSIGNED_SETTING", reason: "not-allowed" },
  ]);
});

test("checks import.meta.env inside client code and JSX expressions", () => {
  assert.deepEqual(findEnvReads([{
    path: clientPath,
    added: [
      { line: 4, text: '<div title={import.meta.env["PUBLIC_SAMPLE"]}>process.env.DISPLAY_TEXT</div>;' },
      { line: 5, text: "const environment = import.meta.env;" },
    ],
  }]).hits, [
    { path: clientPath, line: 4, name: "PUBLIC_SAMPLE", reason: "not-allowed" },
    { path: clientPath, line: 5, name: "*", reason: "whole-object" },
  ]);
});

test("always reports whole-object reads and uses a wildcard for unknown names", () => {
  assert.deepEqual(findEnvReads([{
    path: serverPath,
    added: [
      { line: 1, text: "const copy = { ...process.env };" },
      { line: 2, text: "Object.keys(process.env);" },
      { line: 3, text: "forward(process.env);" },
      { line: 4, text: "const { NODE_ENV, ...rest } = process.env;" },
      { line: 5, text: "const value = process.env[chooseName()];" },
    ],
  }], { allowedNames: ["NODE_ENV", "*"] }).hits, [
    { path: serverPath, line: 1, name: "*", reason: "whole-object" },
    { path: serverPath, line: 2, name: "*", reason: "whole-object" },
    { path: serverPath, line: 3, name: "*", reason: "whole-object" },
    { path: serverPath, line: 4, name: "*", reason: "whole-object" },
    { path: serverPath, line: 5, name: "*", reason: "dynamic-name" },
  ]);
});

test("allows FRIDAY_HOME and NODE_ENV by default and accepts a replacement list", () => {
  const files = [{
    path: serverPath,
    added: [
      { line: 2, text: "const home = process.env.FRIDAY_HOME;" },
      { line: 3, text: 'const mode = process.env["NODE_ENV"];' },
    ],
  }];
  assert.deepEqual(findEnvReads(files), { ok: true, hits: [] });
  assert.deepEqual(findEnvReads(files, { allowedNames: ["FRIDAY_HOME", "SAMPLE_SETTING"] }).hits, [
    { path: serverPath, line: 3, name: "NODE_ENV", reason: "not-allowed" },
  ]);
  assert.deepEqual(findEnvReads([{
    path: serverPath,
    added: [{ line: 8, text: String.raw`const sample = process.env['\u0053AMPLE_SETTING'];` }],
  }], { allowedNames: ["SAMPLE_SETTING"] }), { ok: true, hits: [] });
});

test("ignores direct writes and reports an update that reads the existing value", () => {
  assert.deepEqual(findEnvReads([{
    path: serverPath,
    added: [
      { line: 1, text: "process.env.WRITE_ONLY = sample;" },
      { line: 2, text: 'delete (process.env["REMOVE_ONLY"]);' },
      { line: 3, text: "process.env.UPDATED_SETTING += suffix;" },
    ],
  }]).hits, [
    { path: serverPath, line: 3, name: "UPDATED_SETTING", reason: "not-allowed" },
  ]);
});

test("ignores comments and literal text while checking template interpolations", () => {
  assert.deepEqual(findEnvReads([{
    path: serverPath,
    added: [
      { line: 1, text: "// process.env.IN_COMMENT" },
      { line: 2, text: "/*" },
      { line: 3, text: "process.env.IN_BLOCK" },
      { line: 4, text: '*/ const label = "process.env.IN_STRING";' },
      { line: 5, text: "const template = `process.env.IN_TEXT ${process.env.IN_EXPRESSION}`;" },
      { line: 6, text: "const pattern = /process.env.IN_REGEX/;" },
    ],
  }]).hits, [
    { path: serverPath, line: 5, name: "IN_EXPRESSION", reason: "not-allowed" },
  ]);
});

test("checks qualified process receivers and bracket access", () => {
  assert.deepEqual(findEnvReads([{
    path: serverPath,
    added: [
      { line: 1, text: "const direct = globalThis.process.env.SAMPLE_SETTING;" },
      { line: 2, text: 'const computed = globalThis["process"]?.["env"]?.["EXTRA_SETTING"];' },
      { line: 3, text: "const config = local.process.env.OTHER_SETTING;" },
      { line: 4, text: "const mode = globalThis.process.env.NODE_ENV;" },
      { line: 5, text: "Object.keys(globalThis.process.env);" },
      { line: 6, text: 'const nested = ((globalThis.process).env)?.["NESTED_SETTING"];' },
    ],
  }]).hits, [
    { path: serverPath, line: 1, name: "SAMPLE_SETTING", reason: "not-allowed" },
    { path: serverPath, line: 2, name: "EXTRA_SETTING", reason: "not-allowed" },
    { path: serverPath, line: 3, name: "OTHER_SETTING", reason: "not-allowed" },
    { path: serverPath, line: 5, name: "*", reason: "whole-object" },
    { path: serverPath, line: 6, name: "NESTED_SETTING", reason: "not-allowed" },
  ]);
});

test("reports environment object bindings from process destructuring and named imports", () => {
  assert.deepEqual(findEnvReads([{
    path: serverPath,
    added: [
      { line: 1, text: "const { env } = process;" },
      { line: 2, text: "const { cwd, env: environment } = (globalThis.process);" },
      { line: 3, text: 'import { env as importedEnv, cwd as importedCwd } from "node:process";' },
      { line: 4, text: "import {" },
      { line: 5, text: "  env as legacyEnv," },
      { line: 6, text: '} from "process";' },
      { line: 7, text: 'import { env as unrelated } from "./settings.js";' },
      { line: 8, text: "const { cwd: currentDirectory } = process;" },
      { line: 9, text: "const { env: localEnv } = unrelated;" },
    ],
  }], { allowedNames: ["env", "*"] }).hits, [
    { path: serverPath, line: 1, name: "*", reason: "whole-object" },
    { path: serverPath, line: 2, name: "*", reason: "whole-object" },
    { path: serverPath, line: 3, name: "*", reason: "whole-object" },
    { path: serverPath, line: 5, name: "*", reason: "whole-object" },
  ]);
});

test("checks nested expressions while ignoring regex and JSX text", () => {
  assert.deepEqual(findEnvReads([{
    path: clientPath,
    added: [
      { line: 1, text: 'const view = <><span title="process.env.IN_ATTRIBUTE">process.env.IN_TEXT</span>' },
      { line: 2, text: "  {ready ? <span>{`label ${`${process.env.IN_NESTED_TEMPLATE}`}`}</span> : null}</>;" },
      { line: 3, text: "if (ready) /[process.env.IN_REGEX/]/.test(label);" },
      { line: 4, text: "const ratio = size / process.env.DIVISOR;" },
      { line: 5, text: "const mode = ((process.env as Record<string, string>))?.[`NODE_ENV`];" },
    ],
  }]).hits, [
    { path: clientPath, line: 2, name: "IN_NESTED_TEMPLATE", reason: "not-allowed" },
    { path: clientPath, line: 4, name: "DIVISOR", reason: "not-allowed" },
  ]);
});

test("checks contiguous multiline expressions without joining across missing lines", () => {
  assert.deepEqual(findEnvReads([{
    path: serverPath,
    added: [
      { line: 3, text: 'const value = (process["env"])' },
      { line: 4, text: '  ["SAMPLE_SETTING"];' },
      { line: 10, text: "forward(process.env); /*" },
      { line: 20, text: "const next = process.env.EXTRA_SETTING;" },
    ],
  }]).hits, [
    { path: serverPath, line: 4, name: "SAMPLE_SETTING", reason: "not-allowed" },
    { path: serverPath, line: 10, name: "*", reason: "whole-object" },
    { path: serverPath, line: 20, name: "EXTRA_SETTING", reason: "not-allowed" },
  ]);
});

test("reports an unknown name when an added bracket read is incomplete", () => {
  assert.deepEqual(findEnvReads([{
    path: serverPath,
    added: [
      { line: 3, text: "const value = process.env[" },
      { line: 12, text: "const next = process.env.SAMPLE_SETTING;" },
    ],
  }]).hits, [
    { path: serverPath, line: 3, name: "*", reason: "dynamic-name" },
    { path: serverPath, line: 12, name: "SAMPLE_SETTING", reason: "not-allowed" },
  ]);
});

test("ignores Friday files and tests, and accepts empty input", () => {
  const added = [{ line: 1, text: "process.env.SAMPLE_SETTING" }];
  assert.deepEqual(findEnvReads([
    { path: "src/secrets.ts", added },
    { path: "src/pomelo-extra/settings.ts", added },
    { path: "test/pomelo-settings.test.ts", added },
    { path: "src/pomelo/settings.test.ts", added },
    { path: "src/client/pomelo/settings.spec.tsx", added },
    { path: "src/client/pomelo/__tests__/fixtures.ts", added },
  ]), { ok: true, hits: [] });
  assert.deepEqual(findEnvReads([]), { ok: true, hits: [] });
});

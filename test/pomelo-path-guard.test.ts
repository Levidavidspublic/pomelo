import assert from "node:assert/strict";
import test from "node:test";
import { findHardCodedPaths } from "../src/pomelo/path-guard.js";

const server = "src/pomelo/storage.ts";
const client = "src/client/pomelo/view.tsx";
const spec = "test/pomelo-storage.test.ts";
const user = "fixture-user-322";
const fridayFolder = [".", "friday"].join("");
const home = ["", "home", user, "data"].join("/");
const temp = ["", "tmp", "scratch"].join("/");
const homedirCall = ["homedir", "()"].join("");

function file(path: string, firstLine: number, ...lines: string[]) {
  return { path, addedLines: lines.map((text, index) => ({ line: firstLine + index, text })) };
}

test("reports all three kinds in Pomelo code and tests, with only location metadata", () => {
  const source = `const data = ${JSON.stringify(home)};`;
  const result = findHardCodedPaths([
    file(server, 4, source),
    file(client, 9, `path.join(base, '${fridayFolder}');`),
    file(spec, 16, `const scratch = \`${temp}\`;`),
  ]);

  assert.deepEqual(result, { ok: false, findings: [
    { path: server, line: 4, kind: "home" },
    { path: client, line: 9, kind: "friday-home" },
    { path: spec, line: 16, kind: "temp" },
  ] });
  for (const value of [user, home, source]) assert.ok(!JSON.stringify(result).includes(value));
});

test("recognizes the POSIX and Windows home and temp prefixes", () => {
  const paths = [
    ["", "Users", user].join("/"),
    ["", "root", "data"].join("/"),
    ["~", "data"].join("/"),
    ["C:", "Users", user].join("\\"),
    ["z:", "Users", user].join("/"),
    ["", "var", "tmp", "scratch"].join("/"),
    ["D:", "Windows", "Temp", "scratch"].join("\\"),
    ["q:", "Temp", "scratch"].join("/"),
  ];
  const result = findHardCodedPaths([file(server, 1, ...paths.map((value) => JSON.stringify(value)))]);

  assert.deepEqual(result.findings, paths.map((_, index) => ({
    path: server, line: index + 1, kind: index < 5 ? "home" : "temp",
  })));
});

test("recognizes direct home lookups and exact Friday folder segments", () => {
  const result = findHardCodedPaths([file(server, 20,
    `const direct = ${homedirCall};`,
    `const qualified = os . ${homedirCall};`,
    `const data = "${["local", fridayFolder, "data"].join("/")}";`,
    `const backup = "${fridayFolder}-backup";`,
    `const label = "os.${homedirCall}";`,
    `other.${homedirCall};`,
  )]);

  assert.deepEqual(result.findings, [20, 21, 22].map((line) => ({ path: server, line, kind: "friday-home" })));
});

test("checks template paths and expressions and reports each kind once per line", () => {
  const result = findHardCodedPaths([file(server, 1,
    `const scratch = \`${temp}/\${job}\`; const other = '${temp}';`,
    `const data = \`\${home}/${fridayFolder}/\${job}\`;`,
    `const fromOs = \`\${os.${homedirCall}}/data\`;`,
    `const clean = \`\${home}/${["tmp", "job"].join("/")}\`;`,
    `const backup = \`${fridayFolder}\${suffix}\`;`,
    "const multiline = os",
    `  .${homedirCall};`,
    `const fromOsWithJob = \`\${os.${homedirCall}}/\${job}\`;`,
    `const fromBareWithJob = \`\${${homedirCall}}/\${job}\`;`,
  )]);

  assert.deepEqual(result.findings, [
    { path: server, line: 1, kind: "temp" },
    { path: server, line: 2, kind: "friday-home" },
    { path: server, line: 3, kind: "friday-home" },
    { path: server, line: 6, kind: "friday-home" },
    { path: server, line: 8, kind: "friday-home" },
    { path: server, line: 9, kind: "friday-home" },
  ]);
});

test("distinguishes JSX text from comments and checks embedded expressions", () => {
  const result = findHardCodedPaths([file(client, 1,
    "const label = <p>src/*</p>;",
    `const scratch = '${temp}';`,
    "const panel = <>",
    `  <p>src/* "${home}"</p>`,
    `  {/* '${temp}' */}`,
    `  <p data-home="${home}">{os.${homedirCall}}</p>`,
    "</>;",
  )]);

  assert.deepEqual(result.findings, [
    { path: client, line: 2, kind: "temp" },
    { path: client, line: 6, kind: "home" },
    { path: client, line: 6, kind: "friday-home" },
  ]);
});

test("ignores allowed lookups, URLs and paths in comments", () => {
  assert.deepEqual(findHardCodedPaths([file(server, 30,
    "const scratch = os.tmpdir();",
    "const data = path.join(home, 'data');",
    `// ${JSON.stringify(home)}`,
    `const x = 1; // os.${homedirCall}`,
    "/*",
    `const data = ${JSON.stringify(home)};`,
    "*/",
    `const url = "https://example.test${home}/${fridayFolder}";`,
    `const x = /* ${JSON.stringify(temp)} */ path.join(home, 'data');`,
    `const pattern = /'${fridayFolder}'|${homedirCall}/;`,
  )]), { ok: true, findings: [] });
});

test("checks scope and retains the supplied line numbers across gaps", () => {
  const source = `const scratch = '${temp}';`;
  assert.deepEqual(findHardCodedPaths([
    file("src/local/start.ts", 1, source),
    file("src/pomelo-other/storage.ts", 1, source),
    file("test/other.test.ts", 1, source),
    file("test/pomelo-folder/other.test.ts", 1, source),
    { path: server, addedLines: [{ line: 3, text: "/*" }, { line: 8, text: source }] },
  ]), { ok: false, findings: [{ path: server, line: 8, kind: "temp" }] });
});

test("bad input gives a clean result", () => {
  for (const input of [undefined, null, 42, "bad", {}, [null, {}, { path: server, addedLines: null }], [
    { path: server, addedLines: [null, {}, { line: 0, text: JSON.stringify(temp) }, { line: 1, text: 42 }] },
  ]]) {
    assert.deepEqual(findHardCodedPaths(input), { ok: true, findings: [] });
  }
  const inaccessible = { get path() { throw new Error("unreadable input"); } };
  assert.deepEqual(findHardCodedPaths([inaccessible]), { ok: true, findings: [] });
});

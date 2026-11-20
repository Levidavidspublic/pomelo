import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { hasDirectFridayHomePath, HOME_AUDIT_ALLOWLIST } from "../src/pomelo/home-audit.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const testDirectory = /^(?:test|tests|__tests__)$/;
const sourceFile = /\.[cm]?[jt]sx?$/;
const testFile = /\.(?:test|spec)\.[cm]?[jt]sx?$/;

function* sourcePaths(directory: string): Generator<string> {
  for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory() && !testDirectory.test(entry.name)) yield* sourcePaths(path);
    if (entry.isFile() && sourceFile.test(entry.name) && !testFile.test(entry.name)) yield path;
  }
}

test("the home-folder audit matches the allowlist exactly", () => {
  const actual = [...sourcePaths("src")]
    .filter((path) => hasDirectFridayHomePath(readFileSync(join(root, path), "utf8")))
    .sort();

  assert.deepEqual(actual, HOME_AUDIT_ALLOWLIST);
});

test("detects paths rooted at the user's home, including helpers and other overrides", () => {
  for (const source of [
    'path.join(os.homedir(), ".friday", "state.json")',
    "join(\n  homedir(), /* state root */\n  '.friday/state.json',\n)",
    'const home = () => homedir(); path.resolve(home(), ".friday");',
    'const userHome = os.homedir(); path.join(userHome, ".friday");',
    'process.env.FRIDAY_STATE_DIR || path.join(homedir(), ".friday")',
    '`${os.homedir()}/.friday/state.json`',
    'process.env.HOME + "/.friday/state.json"',
    'process.env.FRIDAY_HOME || join(homedir(), ".friday");\njoin(homedir(), ".friday", "other.json");',
    '// FRIDAY_HOME is planned here\njoin(homedir(), ".friday");',
  ]) {
    assert.equal(hasDirectFridayHomePath(source), true, source);
  }
});

test("detects paths rooted at a home parameter in the function that declares it", () => {
  for (const source of [
    'async function folders(home: string): Promise<string[]> { return path.join(home, ".friday", "worktrees"); }',
    'function guarded(file: string, home: string): string | null {\n' +
      '  const h = home.replace(/\\/$/, "");\n' +
      '  if (under(file, `${h}/.friday`)) return "Friday data";\n' +
      '  return null;\n}',
  ]) {
    assert.equal(hasDirectFridayHomePath(source), true, source);
  }
});

test("ignores configured fallbacks, project folders and references in comments and messages", () => {
  for (const source of [
    'path.join(process.env.FRIDAY_HOME || path.join(os.homedir(), ".friday"), "shots")',
    'path.resolve(options.home ?? process.env["FRIDAY_HOME"] ?? (join(homedir(), ".friday")))',
    'process.env.FRIDAY_HOME || path.resolve(join(homedir(), ".friday"))',
    'path.join(repoRoot, ".friday", "state.json")',
    'path.join(homedir(), "repos", ".friday")',
    'const repoRoot = homedir() + "/repo"; path.join(repoRoot, ".friday");',
    'function one() { const home = homedir(); }\nfunction two() { const home = repoRoot; return join(home, ".friday"); }',
    'function one(home: string) { const h = home.replace(/\\/$/, ""); }\nfunction two(repoRoot: string) { const h = repoRoot; return `${h}/.friday`; }',
    'function folders(home: string) { return process.env.FRIDAY_HOME ?? join(home, ".friday"); }',
    '`${homedir()}/repos/.friday`',
    'path.join(homedir(), ".friday-linked")',
    '// join(homedir(), ".friday");\n/* `${homedir()}/.friday` */',
    'const example = `Run join(homedir(), ".friday") to find state.`;',
    'const example = \'join(homedir(), ".friday")\';',
  ]) {
    assert.equal(hasDirectFridayHomePath(source), false, source);
  }
});

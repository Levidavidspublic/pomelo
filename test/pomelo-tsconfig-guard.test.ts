import assert from "node:assert/strict";
import test from "node:test";
import { checkTsconfigChange } from "../src/pomelo/tsconfig-guard.js";

const fridayTsconfig = `{
  "compilerOptions": {
    "target": "ES2023",
    "lib": [
      "ES2023",
      "DOM",
      "DOM.Iterable"
    ],
    "jsx": "react-jsx",
    "paths": {
      "@/*": [
        "./src/client/*"
      ]
    },
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": [
      "node"
    ]
  },
  "include": [
    "src",
    "test"
  ]
}
`;

const fridayConfig: { compilerOptions: Record<string, unknown>; include: string[] } = JSON.parse(fridayTsconfig);

function configWith(compilerOptions: Record<string, unknown> = {}, root: Record<string, unknown> = {}): string {
  return JSON.stringify({
    ...fridayConfig,
    ...root,
    compilerOptions: { ...fridayConfig.compilerOptions, ...compilerOptions },
  });
}

test("accepts unchanged configs, formatting changes and new library entries", () => {
  for (const after of [fridayTsconfig, configWith(), configWith({ lib: ["ES2023", "DOM", "DOM.Iterable", "WebWorker"] })]) {
    assert.deepEqual(checkTsconfigChange(fridayTsconfig, after), []);
  }
});

test("names strict when it is set to false or removed", () => {
  assert.deepEqual(checkTsconfigChange(fridayTsconfig, configWith({ strict: false })), [
    { rule: "strict-off", detail: "compilerOptions.strict was set to false." },
  ]);
  assert.deepEqual(checkTsconfigChange(fridayTsconfig, configWith({ strict: undefined })), [
    { rule: "strict-off", detail: "compilerOptions.strict was removed." },
  ]);
});

test("names each strict-family flag newly set to false", () => {
  assert.deepEqual(checkTsconfigChange(fridayTsconfig, configWith({ strictNullChecks: false, noImplicitAny: false })), [
    { rule: "strict-flag-off", detail: "compilerOptions.noImplicitAny was set to false." },
    { rule: "strict-flag-off", detail: "compilerOptions.strictNullChecks was set to false." },
  ]);
});

test("names src and test when dropped from include", () => {
  assert.deepEqual(checkTsconfigChange(fridayTsconfig, configWith({}, { include: ["src"] })), [
    { rule: "include-shrunk", detail: 'include no longer lists "test".' },
  ]);
  assert.deepEqual(checkTsconfigChange(fridayTsconfig, configWith({}, { include: undefined })), [
    { rule: "include-shrunk", detail: 'include no longer lists "src".' },
    { rule: "include-shrunk", detail: 'include no longer lists "test".' },
  ]);
});

test("names each new exclude entry once", () => {
  const before = configWith({}, { exclude: ["dist", "build"] });
  const after = configWith({}, { exclude: ["test/**", "dist", "src/generated", "test/**"] });
  assert.deepEqual(checkTsconfigChange(before, after), [
    { rule: "exclude-added", detail: 'exclude now lists "src/generated".' },
    { rule: "exclude-added", detail: 'exclude now lists "test/**".' },
  ]);
});

test("reports allowJs without checkJs, including when checkJs is turned off", () => {
  const detail = "compilerOptions.allowJs is enabled without compilerOptions.checkJs.";
  assert.deepEqual(checkTsconfigChange(fridayTsconfig, configWith({ allowJs: true })), [
    { rule: "checks-loosened", detail },
  ]);
  const checked = configWith({ allowJs: true, checkJs: true });
  assert.deepEqual(checkTsconfigChange(fridayTsconfig, checked), []);
  assert.deepEqual(checkTsconfigChange(checked, configWith({ allowJs: true, checkJs: false })), [
    { rule: "checks-loosened", detail },
  ]);
});

test("reports noEmit when it is removed or set to false", () => {
  assert.deepEqual(checkTsconfigChange(fridayTsconfig, configWith({ noEmit: undefined })), [
    { rule: "checks-loosened", detail: "compilerOptions.noEmit was removed." },
  ]);
  assert.deepEqual(checkTsconfigChange(fridayTsconfig, configWith({ noEmit: false })), [
    { rule: "checks-loosened", detail: "compilerOptions.noEmit was set to false." },
  ]);
});

test("reports changes to the @/* mapping including removal", () => {
  for (const paths of [{ "@/*": ["./src/*"] }, undefined]) {
    assert.deepEqual(checkTsconfigChange(fridayTsconfig, configWith({ paths })), [
      { rule: "paths-changed", detail: 'compilerOptions.paths["@/*"] changed.' },
    ]);
  }
  assert.deepEqual(checkTsconfigChange(fridayTsconfig, configWith({
    paths: { "@/*": ["./src/client/*"], "@test/*": ["./test/*"] },
  })), []);
});

test("returns unreadable for broken JSON or a non-object config", () => {
  for (const after of ['{"compilerOptions":', "null", "[]"]) {
    assert.deepEqual(checkTsconfigChange(fridayTsconfig, after), [
      { rule: "unreadable", detail: "The new tsconfig.json must be a valid JSON object." },
    ]);
  }
});

test("a new config reports only settings that explicitly loosen checks", () => {
  assert.deepEqual(checkTsconfigChange(undefined, fridayTsconfig), []);
  assert.deepEqual(checkTsconfigChange("", "{}"), []);
  assert.deepEqual(checkTsconfigChange(null, JSON.stringify({
    compilerOptions: { strict: false, noImplicitThis: false, allowJs: true },
    exclude: ["test"],
  })), [
    { rule: "checks-loosened", detail: "compilerOptions.allowJs is enabled without compilerOptions.checkJs." },
    { rule: "exclude-added", detail: 'exclude now lists "test".' },
    { rule: "strict-flag-off", detail: "compilerOptions.noImplicitThis was set to false." },
    { rule: "strict-off", detail: "compilerOptions.strict was set to false." },
  ]);
});

test("reports changes in rule then detail order and ignores existing settings", () => {
  const before = configWith({ noImplicitAny: false, allowJs: true }, { exclude: ["dist"] });
  const after = configWith({
    strict: false, noImplicitAny: false, strictFunctionTypes: false, allowJs: true, noEmit: undefined, paths: {},
  }, { include: ["test"], exclude: ["test/**", "dist", "src/generated"] });

  assert.deepEqual(checkTsconfigChange(before, after), [
    { rule: "checks-loosened", detail: "compilerOptions.noEmit was removed." },
    { rule: "exclude-added", detail: 'exclude now lists "src/generated".' },
    { rule: "exclude-added", detail: 'exclude now lists "test/**".' },
    { rule: "include-shrunk", detail: 'include no longer lists "src".' },
    { rule: "paths-changed", detail: 'compilerOptions.paths["@/*"] changed.' },
    { rule: "strict-flag-off", detail: "compilerOptions.strictFunctionTypes was set to false." },
    { rule: "strict-off", detail: "compilerOptions.strict was set to false." },
  ]);
  assert.deepEqual(checkTsconfigChange(after, after), []);
});

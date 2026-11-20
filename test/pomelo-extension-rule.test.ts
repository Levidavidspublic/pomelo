import assert from "node:assert/strict";
import test from "node:test";
import { checkProfileExtensions } from "../src/pomelo/browser/extension-rule.js";

const expected = {
  companionId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  allowedFolder: "/pomelo/extensions/companion",
  sites: ["example.test", "https://accounts.example.test/settings"],
};
const companion = {
  id: expected.companionId,
  folderPath: `${expected.allowedFolder}/1.0`,
  manifestName: "Pomelo Companion",
  hostPermissions: ["https://example.test/*", "https://accounts.example.test/*"],
  apiPermissions: ["cookies"],
};

test("an empty profile can start", () => {
  assert.deepEqual(checkProfileExtensions([], expected), { decision: "start", extensions: [] });
});

test("the companion can start from its own folder or a subfolder with approved permissions", () => {
  for (const folderPath of [expected.allowedFolder, companion.folderPath, `${companion.folderPath}/`]) {
    const result = checkProfileExtensions([{ ...companion, folderPath }], expected);
    assert.equal(result.decision, "start");
    assert.equal(result.extensions.length, 1);
    assert.equal(result.extensions[0].decision, "allow");
    assert.match(result.extensions[0].reason, new RegExp(companion.id));
  }
  const narrower = { ...companion, hostPermissions: [companion.hostPermissions[0]], apiPermissions: [] };
  assert.equal(checkProfileExtensions([narrower], expected).decision, "start");
});

test("a second extension holds the profile even if it copies the companion's name", () => {
  const other = { ...companion, id: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" };
  const result = checkProfileExtensions([companion, other], expected);
  assert.equal(result.decision, "hold");
  assert.match(result.reason, /hold for Amit/i);
  assert.deepEqual(result.extensions.map(({ id, decision }) => ({ id, decision })), [
    { id: companion.id, decision: "allow" },
    { id: other.id, decision: "refuse" },
  ]);
  assert.match(result.extensions[1].reason, new RegExp(`${other.id}.*companion id`, "i"));
});

test("outside folders, prefix lookalikes and traversal out of the allowed folder are refused", () => {
  for (const folderPath of [
    "/pomelo/other", "pomelo/extensions/companion", `${expected.allowedFolder}-copy/1.0`,
    `${expected.allowedFolder}/1.0/../../other`, `${expected.allowedFolder}\\..\\other`,
  ]) {
    const result = checkProfileExtensions([{ ...companion, folderPath }], expected);
    assert.equal(result.decision, "hold", folderPath);
    assert.equal(result.extensions[0].decision, "refuse");
    assert.match(result.extensions[0].reason, new RegExp(`${companion.id}.*folder`, "i"));
  }
});

test("folder containment handles both slash styles independently of the host OS", () => {
  const windows = { ...expected, allowedFolder: "C:\\Pomelo\\Extensions\\Companion\\" };
  const vps = { ...expected, allowedFolder: `${expected.allowedFolder}/` };
  assert.equal(checkProfileExtensions([{ ...companion, folderPath: "C:/Pomelo/Extensions/Companion\\1.0" }], windows).decision, "start");
  assert.equal(checkProfileExtensions([{ ...companion, folderPath: "\\pomelo\\extensions\\companion\\1.0" }], vps).decision, "start");
  for (const folderPath of [
    "C:\\Pomelo\\Extensions\\Companion\\..\\Other", "C:/Pomelo/Extensions/Companion-copy",
    "D:/Pomelo/Extensions/Companion/1.0", "C:Pomelo/Extensions/Companion/1.0",
  ]) {
    assert.equal(checkProfileExtensions([{ ...companion, folderPath }], windows).decision, "hold", folderPath);
  }
});

test("all-sites, wildcard hosts and sites outside the user's selection are refused", () => {
  for (const [pattern, reason] of [
    ["<all_urls>", /all sites/i],
    ["*://*/*", /wildcard/i],
    ["https://*.example.test/*", /wildcard/i],
    ["https://other.example.test/*", /chosen site/i],
    ["http://example.test/*", /chosen site/i],
  ] as const) {
    const result = checkProfileExtensions([{ ...companion, hostPermissions: [companion.hostPermissions[0], pattern] }], expected);
    assert.equal(result.decision, "hold", pattern);
    assert.equal(result.extensions[0].decision, "refuse");
    assert.match(result.extensions[0].reason, new RegExp(companion.id));
    assert.match(result.extensions[0].reason, reason);
  }
});

test("API permissions outside the companion's allowlist are refused", () => {
  for (const permission of ["debugger", "nativeMessaging", "history"]) {
    const result = checkProfileExtensions([{ ...companion, apiPermissions: ["cookies", permission] }], expected);
    assert.equal(result.decision, "hold", permission);
    assert.equal(result.extensions[0].decision, "refuse");
    assert.match(result.extensions[0].reason, new RegExp(`${companion.id}.*API permission`));
  }
});

test("every entry with a repeated companion id is refused", () => {
  for (const duplicate of [companion, { id: companion.id }]) {
    const result = checkProfileExtensions([companion, duplicate], expected);
    assert.equal(result.decision, "hold");
    assert.equal(result.extensions.length, 2);
    for (const extension of result.extensions) {
      assert.equal(extension.decision, "refuse");
      assert.match(extension.reason, new RegExp(`${companion.id}.*duplicate`, "i"));
    }
  }
});

test("malformed inventories and settings hold the profile without throwing", () => {
  for (const [found, settings] of [
    [null, expected], [{}, expected], [[null], expected], [new Array(1), expected],
    [[{ ...companion, manifestName: " " }], expected], [[{ ...companion, apiPermissions: [1] }], expected],
    [[{ ...companion, hostPermissions: new Array(1) }], expected],
    [[], null], [[], { ...expected, companionId: "" }], [[], { ...expected, allowedFolder: "relative" }],
    [[companion], { ...expected, sites: ["example.test", "*.example.test"] }],
    [[], { ...expected, sites: [null] }],
  ]) {
    assert.equal(checkProfileExtensions(found, settings).decision, "hold");
  }

  let readSites = false;
  const settings = { ...expected, get sites() { readSites = true; return expected.sites; } };
  assert.equal(checkProfileExtensions([], settings).decision, "hold");
  assert.equal(readSites, false);
});

test("reasons name the extension without echoing arbitrary manifest text", () => {
  const sample = "fixture-content-marker";
  const extension = {
    ...companion,
    manifestName: sample,
    folderPath: `${companion.folderPath}/${sample}`,
    hostPermissions: [`https://example.test/${sample}`],
    page: sample,
    cookie: sample,
  };
  const result = checkProfileExtensions([extension], expected);
  assert.equal(result.decision, "hold");
  assert.match(result.extensions[0].reason, new RegExp(companion.id));
  assert.equal(JSON.stringify(result).includes(sample), false);
});
